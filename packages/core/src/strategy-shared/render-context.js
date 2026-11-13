import {
	getNonNullableType,
	isNullableType,
	isObjectShapeType,
	parseArrayType,
} from "../checker/index.js";
import { ENUM_C_TYPE_PREFIX, OBJECT_TYPE } from "../constants.js";
import { resolveAnonymousObjectTypeName } from "./anonymous-type-names.js";
import { dataTypeToCType, optionalName } from "./c-types.js";
import { hasDataFields } from "./object-info.js";

const wrapObjectHandle = (isObjectHandleKey, key, valueCType) => {
	return isObjectHandleKey?.(key)
		? `core_object::Object<${valueCType}>`
		: valueCType;
};

const OBJECT_POINTER_C_TYPE = "core_mem::AnyObject";

const resolveObjectStorageCType = (
	userTypeNames,
	anonymousObjectTypes,
	currentFunctionName,
	type,
	importNamespaces,
) => {
	if (userTypeNames?.has(type)) {
		return type;
	}
	if (isObjectShapeType(type)) {
		return resolveAnonymousObjectTypeName(
			type,
			anonymousObjectTypes,
			currentFunctionName,
		);
	}
	const namespace = importNamespaces?.get(type);
	if (namespace) {
		return `${namespace}::${type}`;
	}
	return null;
};

// True when `typeName`'s methods are emitted as FREE functions over an
// `Object<T> &self` handle (so `obj.method(args)` becomes `method(obj, args)`):
// a shared closure, a library-shared closure, or a plain named handle type with
// fields AND methods. A callback record (0 fields, >=1 method) is a handle too,
// but its methods are function-pointer MEMBERS, so it keeps real member calls; a
// class-form closure (or a value struct) does as well.
const resolveUsesFreeObjectMethods = (
	typeName,
	objectTypes,
	objectHandlePredicate,
	libraryFreeMethodTypes,
) => {
	if (libraryFreeMethodTypes?.has(typeName)) {
		return true;
	}
	const info = objectTypes?.[typeName];
	if (!info) {
		return false;
	}
	return Boolean(
		objectHandlePredicate?.(typeName) &&
			hasDataFields(info) &&
			Object.keys(info.methods ?? {}).length !== 0,
	);
};

export const makeRenderContext = ({
	ast,
	sourceLines,
	types,
	wordType,
	wordSize,
	wordCType,
	enumNames,
	enumTypeNames = null,
	libEnumMemberToType,
	libParamTypes,
	libParamDefaults = null,
	resolveCallType,
	objectTypes,
	narrowingRegions,
	resolveImportedName,
	renderStringLiteral,
	userTypeNames,
	flashStrings,
	anonymousObjectTypes = {},
	userObjectMethods = null,
	importNamespaces = null,
	libraryNamespaceObjects = null,
	libEnumNamespaces = null,
	closureFactoryTypes = null,
	currentNamespace = null,
	objectHandlePredicate = null,
	libraryFreeMethodTypes = null,
	resolveLibraryEnumMember = null,
	renderFunctionExpression = null,
	float64Software = false,
}) => {
	let currentFunctionName = null;
	const resolveCType = (type) => {
		const arrayType = parseArrayType(type);
		if (arrayType) {
			const elementCType = resolveCType(arrayType.elementType);
			return `core_array::Array<${elementCType}>`;
		}
		if (enumNames?.has(type)) {
			const enumNamespace = libEnumNamespaces.get(type);
			if (enumNamespace) {
				return enumNamespace === currentNamespace
					? type
					: `${enumNamespace}::${type}`;
			}
			return `${ENUM_C_TYPE_PREFIX}${type}`;
		}
		if (userTypeNames?.has(type)) {
			return wrapObjectHandle(objectHandlePredicate, type, type);
		}
		if (type === OBJECT_TYPE) {
			return OBJECT_POINTER_C_TYPE;
		}
		if (isNullableType(type)) {
			const nonNullType = getNonNullableType(type);
			return optionalName(resolveCType(nonNullType));
		}
		if (isObjectShapeType(type)) {
			return wrapObjectHandle(
				objectHandlePredicate,
				type,
				resolveAnonymousObjectTypeName(
					type,
					anonymousObjectTypes,
					currentFunctionName,
				),
			);
		}
		const namespace = importNamespaces?.get(type);
		if (namespace) {
			// A library type may itself be a SHARED closure lowered to an
			// `Object<T>` handle by the library compile; wrap it exactly like a
			// local handle. Plain library data types stay value structs.
			return wrapObjectHandle(
				objectHandlePredicate,
				type,
				`${namespace}::${type}`,
			);
		}
		return dataTypeToCType(type, wordCType);
	};
	return {
		ast,
		sourceLines,
		types,
		wordType,
		wordSize,
		wordCType,
		enumNames,
		enumTypeNames,
		libEnumMemberToType,
		libParamTypes,
		libParamDefaults,
		resolveCallType,
		objectTypes,
		narrowingRegions,
		resolveImportedName,
		renderStringLiteral,
		flashStrings,
		selfFields: null,
		floatContext: null,
		float64Software,
		functionReturnType: null,
		userObjectMethods,
		userTypeNames,
		importNamespaces,
		libraryNamespaceObjects,
		resolveLibraryEnumMember,
		anonymousObjectTypes,
		closureFactoryTypes,
		renderFunctionExpression,
		getCurrentFunctionName: () => currentFunctionName,
		setCurrentFunctionName: (name) => {
			currentFunctionName = name;
		},
		resolveNameType: (name, loc) => {
			return types.resolve(name, loc);
		},
		toCType: resolveCType,
		isObjectHandle: (key) => {
			const nonNullKey = isNullableType(key) ? getNonNullableType(key) : key;
			return Boolean(objectHandlePredicate?.(nonNullKey));
		},
		objectStorageCType: (type) => {
			return resolveObjectStorageCType(
				userTypeNames,
				anonymousObjectTypes,
				currentFunctionName,
				type,
				importNamespaces,
			);
		},
		usesFreeObjectMethods: (typeName) =>
			resolveUsesFreeObjectMethods(
				typeName,
				objectTypes,
				objectHandlePredicate,
				libraryFreeMethodTypes,
			),
	};
};
