import { AST_NODE } from "embedito95-core";
import { isInLocation } from "../shared/location.js";

export const findIdentifierAt = (node, line, column) => {
	if (!node || typeof node !== "object") {
		return null;
	}

	if (
		node.type === AST_NODE.identifier &&
		isInLocation(line, column, node.loc)
	) {
		return node;
	}

	if (node.type === AST_NODE.memberExpression) {
		const propertyFound = findIdentifierAt(node.property, line, column);

		if (propertyFound) {
			return { ...propertyFound, memberExpression: node };
		}

		return findIdentifierAt(node.object, line, column);
	}

	if (
		node.type === AST_NODE.importSpecifier &&
		isInLocation(line, column, node.loc)
	) {
		return { type: AST_NODE.identifier, name: node.name, loc: node.loc };
	}

	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findIdentifierAt(item, line, column);

				if (found) {
					return found;
				}
			}
		} else {
			const found = findIdentifierAt(value, line, column);

			if (found) {
				return found;
			}
		}
	}

	return null;
};

export const findLiteralAt = (node, line, column) => {
	if (!node || typeof node !== "object") {
		return null;
	}

	if (node.type === AST_NODE.literal && isInLocation(line, column, node.loc)) {
		return node;
	}

	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findLiteralAt(item, line, column);

				if (found) {
					return found;
				}
			}
		} else {
			const found = findLiteralAt(value, line, column);

			if (found) {
				return found;
			}
		}
	}

	return null;
};

export const findTypeNameAt = (node, line, column) => {
	if (!node || typeof node !== "object") {
		return null;
	}

	const typeAnnotation = node.typeAnnotation;
	if (typeAnnotation && typeof typeAnnotation === "object") {
		for (const member of typeAnnotation.members ?? []) {
			if (member?.loc && isInLocation(line, column, member.loc)) {
				return member.name;
			}
		}
		if (typeAnnotation.loc && isInLocation(line, column, typeAnnotation.loc)) {
			return typeAnnotation.type ?? null;
		}
	}

	const returnType = node.returnType;
	if (
		returnType &&
		typeof returnType === "object" &&
		returnType.loc &&
		isInLocation(line, column, returnType.loc)
	) {
		return returnType.name ?? null;
	}

	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findTypeNameAt(item, line, column);
				if (found) {
					return found;
				}
			}
		} else {
			const found = findTypeNameAt(value, line, column);
			if (found) {
				return found;
			}
		}
	}

	return null;
};

export const findVariableDeclaration = (node, name) => {
	if (!node || typeof node !== "object") {
		return null;
	}

	if (
		node.type === AST_NODE.variableDeclaration &&
		(node.kind === "const" || node.kind === "let") &&
		node.declarations?.[0]?.id?.name === name
	) {
		return node;
	}

	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findVariableDeclaration(item, name);

				if (found) {
					return found;
				}
			}
		} else {
			const found = findVariableDeclaration(value, name);

			if (found) {
				return found;
			}
		}
	}

	return null;
};

const collectFunctionExpressionsAt = (node, line, column, matches) => {
	if (!node || typeof node !== "object") {
		return;
	}

	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}

		const children = Array.isArray(value) ? value : [value];

		for (const child of children) {
			collectFunctionExpressionsAt(child, line, column, matches);
		}
	}

	if (
		node.type === AST_NODE.functionExpression &&
		isInLocation(line, column, node.loc)
	) {
		matches.push(node);
	}
};

export const collectEnclosingFunctionExpressions = (
	syntaxTree,
	line,
	column,
) => {
	const matches = [];
	collectFunctionExpressionsAt(syntaxTree, line, column, matches);
	return matches;
};

export const findFunctionDeclaration = (syntaxTree, name) => {
	for (const statement of syntaxTree.body) {
		if (
			statement.type === AST_NODE.variableDeclaration &&
			statement.declarations[0]?.id?.name === name &&
			statement.declarations[0]?.init?.type === AST_NODE.functionExpression
		) {
			return statement.declarations[0].init;
		}
	}

	return null;
};

export const findObjectPropertyKeyAt = (node, line, column) => {
	if (!node || typeof node !== "object") {
		return null;
	}

	if (node.type === AST_NODE.objectProperty) {
		const start = node.loc?.start;
		const valueStart = node.value?.loc?.start ?? node.loc?.end;

		if (
			start &&
			valueStart &&
			isInLocation(line, column, { start, end: valueStart })
		) {
			return node;
		}
	}

	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findObjectPropertyKeyAt(item, line, column);

				if (found) {
					return found;
				}
			}
		} else {
			const found = findObjectPropertyKeyAt(value, line, column);

			if (found) {
				return found;
			}
		}
	}

	return null;
};

export const findTypeMemberAt = (syntaxTree, line, column) => {
	for (const statement of syntaxTree.body) {
		if (statement.type !== AST_NODE.typeDeclaration) {
			continue;
		}

		const member = statement.members?.find((memberItem) => {
			return memberItem.loc && isInLocation(line, column, memberItem.loc);
		});

		if (member) {
			return member;
		}
	}

	return null;
};
