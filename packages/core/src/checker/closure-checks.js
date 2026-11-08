import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import {
	analyzeClosureFactory,
	collectClosureFactories,
	collectLocalClosureDeclarations,
	findReturnObjectLiteral,
	resolveDeclaredReturnType,
	resolveReturnedMethodExpression,
} from "./closure-analysis.js";
import { walk } from "./walk.js";

const isClosureDeclaration = (node) => {
	return (
		node?.type === AST_NODE.variableDeclaration &&
		node.declarations?.[0]?.init?.type === AST_NODE.functionExpression
	);
};

const formatMethodType = (method) => {
	const params = (method?.params ?? [])
		.map((param) => {
			return param.type ?? "?";
		})
		.join(", ");
	return `(${params}) => ${method?.returnType ?? "void"}`;
};

const findNestedClosureInObject = (objectLiteral, localClosureNames) => {
	for (const property of objectLiteral.properties ?? []) {
		if (property.value?.type === AST_NODE.functionExpression) {
			return property;
		}
		if (
			property.value?.type === AST_NODE.identifier &&
			localClosureNames.has(property.value.name)
		) {
			return property;
		}
		if (property.value?.type === AST_NODE.objectLiteral) {
			const nested = findNestedClosureInObject(
				property.value,
				localClosureNames,
			);
			if (nested) {
				return nested;
			}
		}
	}
	return null;
};

const findNestedClosureProperty = (property, localClosureNames) => {
	if (property.value?.type !== AST_NODE.objectLiteral) {
		return null;
	}
	return findNestedClosureInObject(property.value, localClosureNames);
};

const reportNestedClosureProperties = (
	declaration,
	errors,
	claimedDeclarations,
) => {
	const functionNode = declaration.init;
	const returnObj = findReturnObjectLiteral(functionNode);
	const closureDeclarations = collectLocalClosureDeclarations(functionNode);
	if (!returnObj || closureDeclarations.length === 0) {
		return;
	}
	const localClosureNames = new Set(
		closureDeclarations.map((statement) => {
			return statement.declarations[0].id.name;
		}),
	);
	for (const property of returnObj.properties ?? []) {
		const nestedProperty = findNestedClosureProperty(
			property,
			localClosureNames,
		);
		if (!nestedProperty) {
			continue;
		}
		const closureName =
			nestedProperty.value?.name ?? nestedProperty.key ?? property.key;
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unsupportedNestedClosureProperty,
				params: { name: closureName, property: property.key },
				location: nestedProperty.loc ?? property.loc,
			}),
		);
		for (const statement of closureDeclarations) {
			if (statement.declarations[0].id.name === nestedProperty.value?.name) {
				claimedDeclarations.add(statement);
			}
		}
	}
};

const collectNestedClosureClaims = (ast, errors) => {
	const claimedDeclarations = new Set();
	walk(ast, {
		enter: (node) => {
			if (!isClosureDeclaration(node)) {
				return;
			}
			reportNestedClosureProperties(
				node.declarations[0],
				errors,
				claimedDeclarations,
			);
		},
	});
	return claimedDeclarations;
};

const collectFactoryClosureDeclarations = (factories) => {
	const declarations = new Set();
	for (const factory of factories) {
		for (const statement of collectLocalClosureDeclarations(
			factory.functionNode,
		)) {
			declarations.add(statement);
		}
	}
	return declarations;
};

const checkUnsupportedLocalClosure = (node, errors) => {
	const declaration = node.declarations[0];
	errors.push(
		makeDiagnostic({
			code: ERROR_CODE.unsupportedLocalClosure,
			params: { name: declaration.id.name },
			location: declaration.id.loc,
		}),
	);
};

const checkUnsupportedLocalClosures = (
	ast,
	factoryDeclarations,
	nestedClaims,
	errors,
) => {
	walk(ast, {
		enter: (node) => {
			if (!isClosureDeclaration(node)) {
				return;
			}
			if (ast.body.includes(node)) {
				return;
			}
			if (factoryDeclarations.has(node) || nestedClaims.has(node)) {
				return;
			}
			checkUnsupportedLocalClosure(node, errors);
		},
	});
};

const checkFactoryLocalDeclaration = (
	statement,
	capturedFieldNames,
	errors,
) => {
	for (const declaration of statement.declarations ?? []) {
		if (declaration?.init?.type === AST_NODE.functionExpression) {
			continue;
		}
		if (declaration?.id?.name && capturedFieldNames.has(declaration.id.name)) {
			continue;
		}
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unsupportedClosureFactoryLocal,
				params: { name: declaration?.id?.name ?? "" },
				location: declaration?.loc ?? statement.loc,
			}),
		);
	}
};

// A closure factory body is lowered by the codegen into struct fields plus the
// returned object. A local closure is hoisted, a captured local becomes a field
// and its initializer is emitted by the factory; any other declaration would be
// silently dropped along with its initializer side effects, so it is rejected.
const checkClosureFactoryStatements = (factories, errors) => {
	for (const factory of factories) {
		const capturedFieldNames = new Set(
			analyzeClosureFactory(factory).fieldOrder,
		);
		for (const statement of factory.functionNode.body?.body ?? []) {
			if (statement.type === AST_NODE.returnStatement) {
				continue;
			}
			if (statement.type === AST_NODE.variableDeclaration) {
				checkFactoryLocalDeclaration(statement, capturedFieldNames, errors);
				continue;
			}
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.unsupportedClosureFactoryStatement,
					location: statement.loc,
				}),
			);
		}
	}
};

const checkReturnedMethodValues = (state) => {
	const { ast, errors, objectTypes, context } = state;
	walk(ast, {
		enter: (node) => {
			if (!isClosureDeclaration(node)) {
				return;
			}
			const declaration = node.declarations[0];
			const methods =
				objectTypes?.[resolveDeclaredReturnType(declaration)]?.methods;
			if (!methods) {
				return;
			}
			const returnObj = findReturnObjectLiteral(declaration.init);
			if (!returnObj) {
				return;
			}
			const closureDeclarations = collectLocalClosureDeclarations(
				declaration.init,
			);
			for (const property of returnObj.properties ?? []) {
				const method = methods[property.key];
				if (!method) {
					continue;
				}
				if (resolveReturnedMethodExpression(property, closureDeclarations)) {
					continue;
				}
				const actualType = context.resolveCheckExpressionType(property.value);
				if (!actualType) {
					continue;
				}
				errors.push(
					makeDiagnostic({
						code: ERROR_CODE.assignmentTypeMismatch,
						params: {
							name: property.key,
							type: formatMethodType(method),
							rhsType: actualType,
						},
						location: property.loc,
					}),
				);
			}
		},
	});
};

export const checkClosureUsage = (state) => {
	const { ast, errors, objectTypes } = state;
	const factories = collectClosureFactories(ast, objectTypes);
	const nestedClaims = collectNestedClosureClaims(ast, errors);

	checkUnsupportedLocalClosures(
		ast,
		collectFactoryClosureDeclarations(factories),
		nestedClaims,
		errors,
	);
	checkClosureFactoryStatements(factories, errors);
	checkReturnedMethodValues(state);
};
