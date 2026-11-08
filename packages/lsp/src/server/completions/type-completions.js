import { AST_NODE, DATA_TYPE, resolvePlatformTypes } from "embedito95-core";

const TYPE_COMPLETION_KIND = 7;
const TYPE_COMPLETION_DETAIL = "type";
const ENUM_COMPLETION_DETAIL = "enum";

export const getTypeMembers = (syntaxTree, typeName, allExports) => {
	const typeDeclaration = syntaxTree.body.find(
		(statement) =>
			statement.type === AST_NODE.typeDeclaration &&
			statement.name === typeName,
	);

	if (typeDeclaration) {
		return typeDeclaration.members;
	}

	const methods = allExports.objectTypes?.[typeName] ?? {};
	return Object.entries(methods).map(([name, method]) => ({
		name,
		kind: "method",
		params: method.params ?? [],
		returnType: method.returnType ?? null,
	}));
};

export const getEnumMembers = (typeName, allExports, currentPlatform) => {
	let memberList = allExports.enumMembers?.[typeName];

	if (
		(!memberList || memberList.length === 0) &&
		typeName === "Pin" &&
		currentPlatform?.pins
	) {
		memberList = [...Object.keys(currentPlatform.pins)];
	}

	if (
		(!memberList || memberList.length === 0) &&
		typeName === "Serial" &&
		currentPlatform?.serial?.available
	) {
		memberList = currentPlatform.serial.available
			.filter((entry) => entry?.number !== undefined && entry?.number !== null)
			.map((entry) => String(entry.number));
	}

	return memberList;
};

export const getTypeCompletions = (
	syntaxTree,
	allExports,
	platform,
	prefix,
) => {
	const supportedTypes = resolvePlatformTypes(platform);
	const items = [];

	for (const type of Object.values(DATA_TYPE)) {
		if (supportedTypes.size > 0 && !supportedTypes.has(type)) {
			continue;
		}
		items.push({
			label: type,
			kind: TYPE_COMPLETION_KIND,
			detail: TYPE_COMPLETION_DETAIL,
		});
	}

	for (const statement of syntaxTree.body) {
		if (statement.type === AST_NODE.enumDeclaration) {
			items.push({
				label: statement.name,
				kind: TYPE_COMPLETION_KIND,
				detail: ENUM_COMPLETION_DETAIL,
			});
		}
		if (statement.type === AST_NODE.typeDeclaration) {
			items.push({
				label: statement.name,
				kind: TYPE_COMPLETION_KIND,
				detail: "type",
			});
		}
	}

	for (const enumType of Object.keys(allExports.enumMembers ?? {})) {
		items.push({
			label: enumType,
			kind: TYPE_COMPLETION_KIND,
			detail: ENUM_COMPLETION_DETAIL,
		});
	}

	for (const typeName of Object.keys(allExports.objectTypes ?? {})) {
		items.push({
			label: typeName,
			kind: TYPE_COMPLETION_KIND,
			detail: "type",
		});
	}

	if (!prefix) {
		return items;
	}

	const normalizedPrefix = prefix.toLowerCase();

	return items.filter((item) => {
		return item.label.toLowerCase().startsWith(normalizedPrefix);
	});
};
