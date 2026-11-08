import { AST_NODE, ERROR_CODE, FLOAT_TYPES, SEVERITY } from "../constants.js";
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

const pushArgumentTypeMismatch = (
	state,
	argument,
	param,
	actualType,
	severity,
) => {
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
			...(severity && { severity }),
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

	if (FLOAT_TYPES.has(argumentType)) {
		return;
	}

	if (INTEGER_TYPES.has(argumentType)) {
		pushArgumentTypeMismatch(
			state,
			argument,
			param,
			argumentType,
			SEVERITY.warning,
		);
		return;
	}

	pushArgumentTypeMismatch(state, argument, param, argumentType);
};

const checkIdentifierNumericArgument = (state, argument, param) => {
	const argumentType = state.variableTypes.resolve(argument.name, argument.loc);

	if (!argumentType) {
		return;
	}

	if (!INTEGER_TYPES.has(argumentType)) {
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
	} else {
		const argumentRange = TYPE_RANGES[argumentType];
		const paramRange = TYPE_RANGES[param.type];

		if (
			argumentRange &&
			paramRange &&
			(argumentRange.min < paramRange.min || argumentRange.max > paramRange.max)
		) {
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
					severity: SEVERITY.warning,
				}),
			);
		}
	}
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

const pushMemberMismatch = (state, argument, param, fieldType, severity) => {
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
			...(severity && { severity }),
		}),
	);
};

// Mirrors `checkIdentifierNumericArgument`: widening an integer field into a
// wider integer parameter is allowed, narrowing only warns.
const checkMemberNumericArgument = (state, argument, param, fieldType) => {
	if (!INTEGER_TYPES.has(fieldType)) {
		pushMemberMismatch(state, argument, param, fieldType);
		return;
	}

	const fieldRange = TYPE_RANGES[fieldType];
	const paramRange = TYPE_RANGES[param.type];

	if (
		fieldRange &&
		paramRange &&
		(fieldRange.min < paramRange.min || fieldRange.max > paramRange.max)
	) {
		pushMemberMismatch(state, argument, param, fieldType, SEVERITY.warning);
	}
};

const checkMemberFieldArgument = (state, argument, param, fieldType) => {
	if (state.libEnumTypeNames.has(param.type)) {
		if (fieldType !== param.type) {
			pushMemberMismatch(state, argument, param, fieldType);
		}
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
