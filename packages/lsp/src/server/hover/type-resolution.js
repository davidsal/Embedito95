import {
	AST_NODE,
	DATA_TYPE,
	formatFloat32Value,
	formatFloat64Value,
	inferLiteralType,
	resolveConstIntegerType,
	resolveLiteralDataType,
} from "embedito95-core";
import { resolveLibraryReturnType } from "../shared/type-inference.js";

export const formatHoverValue = (value, type) => {
	if (type === DATA_TYPE.f32 && typeof value === "number") {
		return formatFloat32Value(value);
	}
	if (type === DATA_TYPE.f64 && typeof value === "number") {
		return formatFloat64Value(value);
	}
	if (type === "Pin" && typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
};

export const buildParameterTypesByName = (syntaxTree, allExports) => {
	const parameterTypesByName = {};

	for (const exportItem of allExports) {
		if (exportItem.kind === "function" && exportItem.params) {
			parameterTypesByName[exportItem.name] = exportItem.params.map(
				(parameter) => parameter.type,
			);
		}
	}
	for (const statement of syntaxTree.body) {
		if (statement.type === AST_NODE.variableDeclaration) {
			const declaration = statement.declarations?.[0];
			if (declaration?.init?.type === AST_NODE.functionExpression) {
				parameterTypesByName[declaration.id.name] = declaration.init.params.map(
					(parameter) => parameter.typeAnnotation?.type ?? null,
				);
			}
		}
	}

	return parameterTypesByName;
};

export const resolveCallExpressionType = (init, allExports, importAliases) => {
	if (init?.type !== AST_NODE.callExpression) {
		return null;
	}

	const callee = init.callee?.name;

	if (!callee) {
		return null;
	}

	return resolveLibraryReturnType(callee, allExports, importAliases);
};

export const resolvePinMemberValue = (init, hoverPlatform, allExports) => {
	if (init?.type !== AST_NODE.memberExpression) {
		return null;
	}

	const property = init.property?.name;

	if (!property) {
		return null;
	}

	const enumMembersData = allExports.enumMembers ?? {};
	const isPin =
		Object.values(enumMembersData).some((memberList) =>
			memberList.includes(property),
		) || hoverPlatform?.pins?.[property];

	if (!isPin) {
		return null;
	}

	const enumType = Object.entries(enumMembersData).find(([, memberList]) =>
		memberList.includes(property),
	)?.[0];

	if (enumType) {
		return `${enumType}.${property}`;
	}

	const resolvedPin = hoverPlatform?.pins?.[property];
	const numericValue = Number(property);
	return Number.isNaN(numericValue)
		? (resolvedPin?.name ?? property)
		: numericValue;
};

export const resolveConstType = (declaration, value) => {
	const annotation = declaration?.id?.typeAnnotation?.type;

	if (annotation) {
		return annotation;
	}

	const initializer = declaration?.init;
	const literalType =
		initializer?.type === AST_NODE.literal
			? resolveLiteralDataType(initializer)
			: null;

	if (literalType === DATA_TYPE.f32 || literalType === DATA_TYPE.f64) {
		return literalType;
	}

	if (typeof value === "number" && Number.isInteger(value)) {
		return resolveConstIntegerType(value) ?? "unknown";
	}

	return literalType ?? inferLiteralType(value) ?? "unknown";
};
