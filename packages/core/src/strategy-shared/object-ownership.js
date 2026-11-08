import {
	decodeObjectShape,
	isObjectShapeType,
	parseArrayType,
} from "../checker/index.js";
import {
	AST_NODE,
	DATA_TYPE,
	DATA_TYPE_TO_C_TYPE,
	OBJECT_TYPE,
} from "../constants.js";
import { hasDataFields } from "./object-info.js";

// Value data-types that can live directly inside an object fields struct (every
// DATA_TYPE whose C type is not the void reference): a scalar, or a `string`
// (itself a shared handle stored by value and freed in cascade by the Ref
// destructor), optionally nullable. A named object type may also carry a field
// whose type is ANOTHER named data-object handle (`core_object::Object<...>`
// member stored by value; freeing the outer body releases the inner one). The
// generic `Object` type (a raw `void*` reference) is owned the same way: the
// pointer itself is a plain value the Ref frees, not its pointee.
const OBJECT_FIELD_VALUE_TYPES = new Set([
	...Object.keys(DATA_TYPE_TO_C_TYPE).filter(
		(typeName) => typeName !== DATA_TYPE.void,
	),
	OBJECT_TYPE,
]);

// Named types that are trivially-copyable POD VALUE types can be owned directly
// by an `Object<T>` box (freed with the box, no nested refs to cascade): project
// and imported ENUMS (integral PODs) and platform value types such as `Pin`.
// Enum declarations are `AST_NODE.enumDeclaration` in the AST; imported enums are
// the `libEnumNames` set built from `libraryEnumInfo`.
export const collectOwnedPODTypeNames = (ast, libEnumNames) => {
	const names = new Set(libEnumNames ?? []);
	for (const statement of ast.body ?? []) {
		if (statement.type === AST_NODE.enumDeclaration && statement.name) {
			names.add(statement.name);
		}
	}
	return names;
};

// A library object type that declares METHODS is compiled separately, so its C++
// shape is already fixed when this unit references it: it is lowered to the
// self-contained `class { Ref<Body> }` handle (or, for a callback record, a
// stateless struct of function pointers). Either way it is safe to store BY
// VALUE inside an `Object<T>` box and freed in cascade by the box destructor
// (`~Ref<Body>` releases the nested handle; function pointers are trivially
// copyable). Marking them owned lets a closure that captures a library handle
// (e.g. `SpiBus`/`I2CBus`/`SerialPort`) qualify as a shared `Object<T>` instead
// of falling back to the value class form. Library DATA objects (no methods)
// are already covered by the handle fixpoint, so only the method-carrying ones
// are added here.
export const collectOwnedLibraryTypeNames = (libraryObjectTypes) => {
	const names = new Set();
	for (const types of Object.values(libraryObjectTypes ?? {})) {
		for (const [typeName, info] of Object.entries(types ?? {})) {
			if (Object.keys(info?.methods ?? {}).length > 0) {
				names.add(typeName);
			}
		}
	}
	return names;
};

// A named object type qualifies to be re-expressed as a shared handle when it
// either is a plain data object, a closure (captured state becomes the fields
// and its methods become free functions over `Object<T>`), or a CALLBACK RECORD
// (0 fields, >=1 method: its methods become function-pointer members so the
// handle shares them). Fields may be owned directly (scalars/`string`) or
// reference another named object handle. Excluded: a closure whose captured
// field is not owned (the ownership fixpoint drops it; see the guard in
// `generateCode`), and fields whose type is an array / nested-object-not-handle.
//
// A LIBRARY type declared by ANOTHER module is already compiled there, so only
// the ones that module marked as shared handles (carried in `libraryObjectInfo`,
// added separately) may join the handle set; a method-carrying imported type
// must keep its compiled shape and is therefore excluded here. A callback record
// declared HERE becomes a handle; a library callback record's shape is fixed by
// the library compile and is propagated through `libraryObjectInfo` instead.
const isObjectFieldCandidate = (objectInfo, isDeclaredHere) => {
	if (!objectInfo) {
		return false;
	}
	const methodCount = Object.keys(objectInfo.methods ?? {}).length;
	if (!hasDataFields(objectInfo)) {
		return isDeclaredHere && methodCount > 0;
	}
	if (!isDeclaredHere && methodCount !== 0) {
		return false;
	}
	return true;
};

// Because a field can reference another named object type, "is this type a
// handle?" depends on the types it references, so membership is a GREATEST
// fixpoint over the named-type graph: start with every qualifying type and
// repeatedly drop any type whose non-owned field refers to a type that is not
// itself in the set. (Mutual/self references stay in the set: the members are
// `Object<...>` handles, so the value structs stay finite.)
//
// A field is owned by its enclosing Ref when it is a scalar/`string`, a POD
// enum/platform type, a library handle (`class { Ref<Body> }`, see
// `collectOwnedLibraryTypeNames`), or a named object handle, or an ARRAY whose
// element is one of those (the element must itself be owned so
// `Array<Object<...>>` can be freed in cascade). An element that is itself
// another array is not owned here yet.
const isFieldTypeOwnedByHandle = (isHandle, fieldType, ownedFieldTypes) => {
	const arrayType = parseArrayType(fieldType);
	if (arrayType) {
		const elementType = arrayType.elementType;
		return (
			OBJECT_FIELD_VALUE_TYPES.has(elementType) ||
			isHandle.has(elementType) ||
			ownedFieldTypes.has(elementType)
		);
	}
	return (
		OBJECT_FIELD_VALUE_TYPES.has(fieldType) ||
		isHandle.has(fieldType) ||
		ownedFieldTypes.has(fieldType)
	);
};

export const deriveObjectHandleTypeNames = (
	objectTypes,
	ownedFieldTypes,
	userTypeNames,
) => {
	const names = Object.keys(objectTypes);
	const isHandle = new Set(
		names.filter((name) =>
			isObjectFieldCandidate(objectTypes[name], userTypeNames?.has(name)),
		),
	);
	let changed = true;
	while (changed) {
		changed = false;
		for (const name of names) {
			if (!isHandle.has(name)) {
				continue;
			}
			const fields = objectTypes[name]?.fields ?? {};
			for (const field of Object.values(fields)) {
				if (!isFieldTypeOwnedByHandle(isHandle, field.type, ownedFieldTypes)) {
					isHandle.delete(name);
					changed = true;
					break;
				}
			}
		}
	}
	return isHandle;
};

// `deriveObjectHandleTypeNames` decides membership for NAMED types only. An
// ANONYMOUS shape (`object:{…}`) has no declaration to walk, so its own handle
// membership is decided lazily from the decoded field graph: a shape is a
// handle exactly when every field is owned (scalar/`string`, another handle, or
// an array whose element is scalar/`string`/a handle). Because shapes are
// structural (a field type is a flat type string) there are no cycles, so the
// check is a finite recursion over the decoded fields; `memo` keeps it cheap.
export const makeShapeHandlePredicate = (
	namedObjectHandleTypeNames,
	ownedFieldTypes,
) => {
	const memo = new Map();
	const isFieldOwned = (fieldType) => {
		const arrayType = parseArrayType(fieldType);
		if (arrayType) {
			const elementType = arrayType.elementType;
			return (
				OBJECT_FIELD_VALUE_TYPES.has(elementType) ||
				isHandleKey(elementType) ||
				ownedFieldTypes.has(elementType)
			);
		}
		return (
			OBJECT_FIELD_VALUE_TYPES.has(fieldType) ||
			isHandleKey(fieldType) ||
			ownedFieldTypes.has(fieldType)
		);
	};
	const isHandleKey = (typeName) => {
		if (namedObjectHandleTypeNames.has(typeName)) {
			return true;
		}
		if (!isObjectShapeType(typeName)) {
			return false;
		}
		if (memo.has(typeName)) {
			return memo.get(typeName);
		}
		const fields = decodeObjectShape(typeName) ?? {};
		const result = Object.values(fields).every((field) => {
			return isFieldOwned(field.type);
		});
		memo.set(typeName, result);
		return result;
	};
	return isHandleKey;
};

// A library type declared by ANOTHER module was already compiled there, so the
// local ownership scan only knows its name, not how the library lowered it. The
// library compile records that in `libraryObjectInfo` (`isHandle`), and any such
// type joins the handle set so the project wraps it as `core_object::Object<…>`
// instead of a plain struct. These are NOT added to `objectTypes` (that would
// make the project re-render a type the library header already declares). The
// subset whose methods are FREE functions (`usesFreeObjectMethods`) is returned
// separately so `obj.method(args)` is emitted as `method(obj, args)`; a library
// callback record keeps its function-pointer member calls.
export const collectLibraryHandleTypes = (
	libraryObjectInfo,
	userTypeNames,
	objectHandleTypeNames,
) => {
	const libraryFreeMethodTypes = new Set();
	if (!libraryObjectInfo) {
		return libraryFreeMethodTypes;
	}
	for (const [name, info] of libraryObjectInfo) {
		if (!info?.isHandle || userTypeNames.has(name)) {
			continue;
		}
		objectHandleTypeNames.add(name);
		if (info.usesFreeObjectMethods) {
			libraryFreeMethodTypes.add(name);
		}
	}
	return libraryFreeMethodTypes;
};

// Every closure lowers to a shared `Object<T>` handle: a stateful closure keeps
// its captured fields in the public storage struct and its methods are free
// functions over `Object<T>`; a stateless closure is a CALLBACK RECORD (0 fields,
// >=1 method) whose methods are function-pointer members. A closure capturing a
// non-owned field would be dropped by the ownership fixpoint, and the class form
// that used to own such a field (`Ref<Body>`) no longer exists — so assert the
// invariant loudly instead of emitting a struct that would shallow-copy it.
export const assertClosuresAreHandles = (
	userTypeNames,
	objectTypes,
	objectHandleTypeNames,
) => {
	for (const name of userTypeNames) {
		const info = objectTypes[name];
		if (
			info?.isClosureClass &&
			hasDataFields(info) &&
			!objectHandleTypeNames.has(name)
		) {
			throw new Error(
				`Closure '${name}' captures a field that is not owned by a shared handle, so it cannot be lowered to Object<${name}>. Captured fields must be scalars, strings, named handles, or arrays of those.`,
			);
		}
	}
};

// Per-type runtime info for types DECLARED by THIS module that another compile
// (the project consuming this as a library) cannot re-derive from a static scan:
// whether the type was lowered to a shared `Object<T>` handle and, if so, whether
// its methods are FREE functions (`method(obj, args)`) or function-pointer
// MEMBERS (`obj->method(args)`, a callback record). Exported so the library
// wrapper can carry it across the library/project boundary.
export const buildObjectTypeInfo = (
	userTypeNames,
	objectTypes,
	objectHandleTypeNames,
) => {
	const objectTypeInfo = new Map();
	for (const name of userTypeNames) {
		const info = objectTypes[name];
		if (!info || !objectHandleTypeNames.has(name)) {
			continue;
		}
		objectTypeInfo.set(name, {
			isHandle: true,
			usesFreeObjectMethods: hasDataFields(info),
		});
	}
	return objectTypeInfo;
};
