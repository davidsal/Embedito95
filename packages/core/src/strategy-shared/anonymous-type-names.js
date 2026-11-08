import {
	collectFunctionDeclarations,
	getNonNullableType,
	isObjectShapeType,
} from "../checker/index.js";
import { ANONYMOUS_OBJECT_FALLBACK_NAME, CONST_KIND } from "../constants.js";

const STARTING_SUFFIX = 1;

const findAvailableTypeName = (base, usedNames, suffix) => {
	const candidate = `${base}${suffix}`;
	return usedNames.has(candidate)
		? findAvailableTypeName(base, usedNames, suffix + 1)
		: candidate;
};

export const resolveAnonymousObjectTypeName = (
	shapeType,
	anonymousObjectTypes,
	hint,
) => {
	if (anonymousObjectTypes[shapeType]) {
		return anonymousObjectTypes[shapeType].name;
	}
	const base = hint ? `${hint}Return` : ANONYMOUS_OBJECT_FALLBACK_NAME;
	const usedNames = new Set(
		Object.values(anonymousObjectTypes).map((entry) => {
			return entry.name;
		}),
	);
	const name = usedNames.has(base)
		? findAvailableTypeName(base, usedNames, STARTING_SUFFIX)
		: base;
	anonymousObjectTypes[shapeType] = { name, shapeType };
	return name;
};

export const reserveAnonymousObjectTypeNames = (
	ast,
	userFunctionReturnTypes,
	anonymousObjectTypes,
) => {
	for (const { statement, declaration } of collectFunctionDeclarations(ast)) {
		if (statement.kind !== CONST_KIND) {
			continue;
		}
		if (!declaration?.id?.name) {
			continue;
		}
		const functionName = declaration.id.name;
		if (functionName === "setup" || functionName === "main") {
			continue;
		}
		const returnType = userFunctionReturnTypes.get(functionName);
		if (!returnType) {
			continue;
		}
		const nonNullType = getNonNullableType(returnType);
		if (!isObjectShapeType(nonNullType)) {
			continue;
		}
		resolveAnonymousObjectTypeName(
			nonNullType,
			anonymousObjectTypes,
			functionName,
		);
	}
};
