import {
	ADD_OPERATOR,
	AST_NODE,
	CONST_KIND,
	DATA_TYPE,
	DIVIDE_OPERATOR,
	MODULO_OPERATOR,
	MULTIPLY_OPERATOR,
	NOT_OPERATOR,
	SUBTRACT_OPERATOR,
	UNARY_PLUS_OPERATOR,
} from "./constants.js";

const BINARY_EVALUATORS = {
	[ADD_OPERATOR]: (left, right) => {
		return left + right;
	},
	[SUBTRACT_OPERATOR]: (left, right) => {
		return left - right;
	},
	[MULTIPLY_OPERATOR]: (left, right) => {
		return left * right;
	},
	[DIVIDE_OPERATOR]: (left, right) => {
		return left / right;
	},
	[MODULO_OPERATOR]: (left, right) => {
		return left % right;
	},
};

export const evaluateBinaryNumber = (operator, left, right) => {
	const evaluator = BINARY_EVALUATORS[operator];
	if (!evaluator) {
		return NaN;
	}
	return evaluator(left, right);
};

const isFiniteNumber = (value) => {
	return typeof value === "number" && Number.isFinite(value);
};

export const nodeIsFloat = (ast, node) => {
	if (!node || typeof node !== "object") {
		return false;
	}
	if (node.type === AST_NODE.literal) {
		if (typeof node.value !== "number") {
			return false;
		}
		return (
			!Number.isInteger(node.value) ||
			(typeof node.raw === "string" && node.raw.includes("."))
		);
	}
	if (node.type === AST_NODE.parenthesizedExpression) {
		return nodeIsFloat(ast, node.expression);
	}
	if (node.type === AST_NODE.asExpression) {
		return (
			node.targetType.name === DATA_TYPE.f32 ||
			node.targetType.name === DATA_TYPE.f64
		);
	}
	if (node.type === AST_NODE.identifier) {
		const declaration = findConstantDeclaration(ast, node.name);
		return declaration ? nodeIsFloat(ast, declaration.init) : false;
	}
	if (node.type === AST_NODE.binaryExpression) {
		return nodeIsFloat(ast, node.left) && nodeIsFloat(ast, node.right);
	}
	if (node.type === AST_NODE.unaryExpression) {
		return nodeIsFloat(ast, node.argument);
	}
	if (node.type === AST_NODE.awaitExpression) {
		return nodeIsFloat(ast, node.argument);
	}
	return false;
};

const findConstantDeclaration = (ast, name) => {
	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		if (statement.kind !== CONST_KIND) {
			continue;
		}

		const declaration = statement.declarations?.[0];

		if (declaration?.id?.name === name) {
			return declaration;
		}
	}

	return null;
};

const evaluateTemplateLiteral = (ast, node, floatContext) => {
	const expressions = node.expressions ?? [];
	let result = node.quasis?.[0] ?? "";
	for (let index = 0; index < expressions.length; index++) {
		const value = evaluateConstant(ast, expressions[index], floatContext);
		if (value === null || value === undefined) {
			return null;
		}
		result += `${String(value)}${node.quasis?.[index + 1] ?? ""}`;
	}
	return result;
};

const evaluateIdentifier = (ast, node, floatContext) => {
	const declaration = findConstantDeclaration(ast, node.name);

	if (!declaration) {
		return null;
	}

	return evaluateConstant(ast, declaration.init, floatContext);
};

const evaluateConditionalExpression = (ast, node, floatContext) => {
	const test = evaluateConstant(ast, node.test, floatContext);

	if (typeof test !== "boolean") {
		return null;
	}

	return evaluateConstant(
		ast,
		test ? node.consequent : node.alternate,
		floatContext,
	);
};

const evaluateUnaryExpression = (ast, node) => {
	const argument = evaluateConstant(ast, node.argument);

	if (node.operator === NOT_OPERATOR) {
		return typeof argument === "boolean" ? !argument : null;
	}

	if (node.operator === SUBTRACT_OPERATOR) {
		return isFiniteNumber(argument) ? -argument : null;
	}

	if (node.operator === UNARY_PLUS_OPERATOR) {
		return isFiniteNumber(argument) ? argument : null;
	}

	return null;
};

const evaluateBinaryInFloatContext = (
	ast,
	node,
	evaluator,
	left,
	right,
	floatContext,
) => {
	if (floatContext) {
		return evaluator(left, right);
	}

	const leftIsFloat = nodeIsFloat(ast, node.left);
	const rightIsFloat = nodeIsFloat(ast, node.right);

	let result;

	if (leftIsFloat && rightIsFloat) {
		result = evaluator(left, right);
	} else if (leftIsFloat) {
		result = evaluator(Math.trunc(left), right);
	} else if (rightIsFloat) {
		result = evaluator(left, Math.trunc(right));
	} else {
		result = evaluator(left, right);
	}

	if (!(leftIsFloat && rightIsFloat) && node.operator === DIVIDE_OPERATOR) {
		result = Math.trunc(result);
	}

	return result;
};

const evaluateBinaryExpression = (ast, node, floatContext) => {
	const left = evaluateConstant(ast, node.left, floatContext);
	const right = evaluateConstant(ast, node.right, floatContext);
	const evaluator = BINARY_EVALUATORS[node.operator];

	if (!isFiniteNumber(left) || !isFiniteNumber(right) || !evaluator) {
		return null;
	}

	let result = evaluateBinaryInFloatContext(
		ast,
		node,
		evaluator,
		left,
		right,
		floatContext,
	);

	const resultFloatType =
		floatContext ||
		(nodeIsFloat(ast, node.left) && nodeIsFloat(ast, node.right)
			? DATA_TYPE.f32
			: null);

	if (resultFloatType === DATA_TYPE.f32) {
		result = Math.fround(result);
	}

	return isFiniteNumber(result) ? result : null;
};

export const evaluateConstant = (ast, node, floatContext = null) => {
	if (!node) {
		return null;
	}

	if (node.type === AST_NODE.literal) {
		return node.value;
	}

	if (node.type === AST_NODE.templateLiteral) {
		return evaluateTemplateLiteral(ast, node, floatContext);
	}

	if (node.type === AST_NODE.parenthesizedExpression) {
		return evaluateConstant(ast, node.expression, floatContext);
	}

	if (node.type === AST_NODE.asExpression) {
		return evaluateConstant(ast, node.expression, floatContext);
	}

	if (node.type === AST_NODE.identifier) {
		return evaluateIdentifier(ast, node, floatContext);
	}

	if (node.type === AST_NODE.conditionalExpression) {
		return evaluateConditionalExpression(ast, node, floatContext);
	}

	if (node.type === AST_NODE.binaryExpression) {
		return evaluateBinaryExpression(ast, node, floatContext);
	}

	if (node.type === AST_NODE.unaryExpression) {
		return evaluateUnaryExpression(ast, node);
	}

	if (node.type === AST_NODE.awaitExpression) {
		return evaluateConstant(ast, node.argument, floatContext);
	}

	return null;
};
