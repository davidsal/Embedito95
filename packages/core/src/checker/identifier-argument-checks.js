import { AST_NODE, ERROR_CODE, FLOAT_TYPES } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { getDeclaration } from "./declaration-accessors.js";
import { resolveObjectFieldType } from "./object-shapes.js";
import { resolveEnumType } from "./type-resolution.js";
import {
	CHARACTER_TYPES,
	INTEGER_TYPES,
	isNullableType,
	TYPE_RANGES,
} from "./types.js";

const resolveIdentifierTypeAt = (state, argument) => {
	if (state.context?.resolveVariableTypeAt) {
		return state.context.resolveVariableTypeAt(argument.name, argument.loc);
	}
	return state.variableTypes.get(argument.name);
};

export const checkIdentifierArgument = (state, argument, param) => {
	if (state.libEnumTypeNames.has(param.type)) {
		checkEnumIdentifierArgument(state, argument, param);
		return;
	}

	if (CHARACTER_TYPES.has(param.type)) {
		checkIdentifierCharacterArgument(state, argument, param);
		return;
	}

	if (FLOAT_TYPES.has(param.type)) {
		checkIdentifierFloatArgument(state, argument, param);
		return;
	}

	if (TYPE_RANGES[param.type]) {
		checkIdentifierNumericArgument(state, argument, param);
	}
};

const checkIdentifierCharacterArgument = (state, argument, param) => {
	const argumentType = state.variableTypes.resolve(argument.name, argument.loc);

	if (argumentType && argumentType !== param.type) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: argumentType,
					value: argument.name,
				},
				location: argument.loc,
			}),
		);
	}
};

const pushArgumentTypeMismatch = (state, argument, param, actualType) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.argumentTypeMismatch,
			params: {
				name: param.name,
				expected: param.type,
				actual: actualType,
				value: argument.name,
			},
			location: argument.loc,
		}),
	);
};

const checkIdentifierFloatArgument = (state, argument, param) => {
	const argumentType = resolveIdentifierTypeAt(state, argument);

	if (!argumentType) {
		return;
	}

	if (isNullableType(argumentType)) {
		pushArgumentTypeMismatch(state, argument, param, argumentType);
		return;
	}

	if (FLOAT_TYPES.has(argumentType) || INTEGER_TYPES.has(argumentType)) {
		// Numeric source into a numeric parameter is an implicit cast with
		// truncation: no diagnostic. The hover reports the precision note.
		return;
	}

	pushArgumentTypeMismatch(state, argument, param, argumentType);
};

const checkIdentifierNumericArgument = (state, argument, param) => {
	const argumentType = state.variableTypes.resolve(argument.name, argument.loc);

	if (!argumentType) {
		return;
	}

	if (FLOAT_TYPES.has(argumentType) || INTEGER_TYPES.has(argumentType)) {
		// Numeric source into a numeric parameter is an implicit cast with
		// truncation: no diagnostic. The hover reports the precision note.
		return;
	}

	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.argumentTypeMismatch,
			params: {
				name: param.name,
				expected: param.type,
				actual: argumentType,
				value: argument.name,
			},
			location: argument.loc,
		}),
	);
};

const checkEnumIdentifierArgument = (state, argument, param) => {
	const memberEnum = resolveEnumType(
		argument.name,
		param.type,
		state.defined,
		state.libEnumMembersByType,
	);
	if (memberEnum !== param.type) {
		const isKnownType =
			state.libNameToType[argument.name] !== undefined ||
			state.functionParameterCount[state.resolveImportedName(argument.name)] !==
				undefined;
		const referencedStatement = state.defined.get(argument.name);

		if (!referencedStatement && !isKnownType) {
			return;
		}

		const declaration =
			referencedStatement && getDeclaration(referencedStatement);
		if (
			declaration?.init?.type === AST_NODE.memberExpression &&
			declaration.init.property?.name &&
			state.libEnumTypeNames.has(declaration.init.object?.name) &&
			declaration.init.object?.name !== param.type
		) {
			return;
		}
		const actualType = state.libEnumTypeNames.has(argument.name)
			? "enum"
			: (state.libNameToType[argument.name] ??
				state.variableTypes.resolve(argument.name, argument.loc) ??
				"unknown");
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: actualType,
					value: argument.name,
				},
				location: argument.loc,
			}),
		);
	}
};

export const checkMemberArgument = (state, argument, param) => {
	const objName = argument.object?.name;
	const propName = argument.property?.name;
	const objectType = objName
		? state.variableTypes.resolve(objName, argument.object.loc)
		: null;
	const fieldType = objectType
		? resolveObjectFieldType(objectType, propName, state.objectTypes)
		: null;
	if (fieldType) {
		checkMemberFieldArgument(state, argument, param, fieldType);
	} else if (objName && propName && state.libEnumTypeNames.has(param.type)) {
		const memberEnum = state.libEnumMembersByType[param.type]?.has(propName);
		if (!memberEnum || argument.object.type !== AST_NODE.identifier) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: `${objName}.${propName}`,
						value: `${objName}.${propName}`,
					},
					location: argument.loc,
				}),
			);
		}
	}
};

const pushMemberMismatch = (state, argument, param, fieldType) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.argumentTypeMismatch,
			params: {
				name: param.name,
				expected: param.type,
				actual: fieldType,
				value: `${argument.object?.name}.${argument.property?.name}`,
			},
			location: argument.loc,
		}),
	);
};

// Mirrors `checkIdentifierNumericArgument`: a numeric field flowing into a
// numeric parameter casts with truncation, so it emits no diagnostic.
const checkMemberNumericArgument = (state, argument, param, fieldType) => {
	if (FLOAT_TYPES.has(fieldType) || INTEGER_TYPES.has(fieldType)) {
		// Numeric source into a numeric parameter is an implicit cast with
		// truncation: no diagnostic. The hover reports the precision note.
		return;
	}

	pushMemberMismatch(state, argument, param, fieldType);
};

const checkMemberFloatArgument = (state, argument, param, fieldType) => {
	if (fieldType === param.type) {
		return;
	}
	if (INTEGER_TYPES.has(fieldType) || FLOAT_TYPES.has(fieldType)) {
		// Numeric source into a numeric parameter is an implicit cast with
		// truncation: no diagnostic. The hover reports the precision note.
		return;
	}
	pushMemberMismatch(state, argument, param, fieldType);
};

const checkMemberFieldArgument = (state, argument, param, fieldType) => {
	if (state.libEnumTypeNames.has(param.type)) {
		if (fieldType !== param.type) {
			pushMemberMismatch(state, argument, param, fieldType);
		}
		return;
	}

	if (FLOAT_TYPES.has(param.type)) {
		checkMemberFloatArgument(state, argument, param, fieldType);
		return;
	}

	if (TYPE_RANGES[param.type]) {
		checkMemberNumericArgument(state, argument, param, fieldType);
		return;
	}

	if (fieldType !== param.type) {
		pushMemberMismatch(state, argument, param, fieldType);
	}
};
