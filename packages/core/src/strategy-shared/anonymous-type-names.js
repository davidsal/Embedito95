import {
	collectFunctionDeclarations,
	getNonNullableType,
	isObjectShapeType,
} from "../checker/index.js";
import { ANONYMOUS_OBJECT_FALLBACK_NAME, CONST_KIND } from "../constants.js";

const STARTING_SUFFIX = 1;
const SYNTHESIZED_PREFIX = "_";

const findAvailableTypeName = (base, usedNames, suffix) => {
	const candidate = `${base}${suffix}`;
	return usedNames.has(candidate)
		? findAvailableTypeName(base, usedNames, suffix + 1)
		: candidate;
};

// Every synthesized name is prefixed so it cannot collide with a user type.
// The prefix is idempotent, which keeps constants that already carry it (such
// as the fallback name) from ending up with a double `__`.
const withSynthesizedPrefix = (name) => {
	return name.startsWith(SYNTHESIZED_PREFIX)
		? name
		: `${SYNTHESIZED_PREFIX}${name}`;
};

const collectUsedNames = (anonymousObjectTypes, userTypeNames) => {
	const usedNames = new Set(userTypeNames ?? []);
	for (const entry of Object.values(anonymousObjectTypes)) {
		usedNames.add(entry.name);
	}
	return usedNames;
};

export const resolveAnonymousObjectTypeName = (
	shapeType,
	anonymousObjectTypes,
	hint,
	userTypeNames = null,
) => {
	if (anonymousObjectTypes[shapeType]) {
		return anonymousObjectTypes[shapeType].name;
	}
	const base = withSynthesizedPrefix(
		hint ? `${hint}Return` : ANONYMOUS_OBJECT_FALLBACK_NAME,
	);
	const usedNames = collectUsedNames(anonymousObjectTypes, userTypeNames);
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
	userTypeNames = null,
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
			userTypeNames,
		);
	}
};
