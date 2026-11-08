import {
	AST_NODE,
	DATA_TYPE,
	evaluateConstant,
	getNonNullableType,
	isNarrowedAt,
	resolveVariableType,
} from "embedito95-core";
import { formatDocComment, getDocComment } from "../shared/doc-comments.js";
import {
	findFunctionDeclaration,
	findVariableDeclaration,
} from "./ast-finders.js";
import { findParameterInfo } from "./doc-sections.js";
import {
	formatCastWarningsSection,
	formatObjectShapeType,
} from "./formatting.js";
import { getFunctionSignature } from "./function-signature.js";
import {
	formatHoverValue,
	resolveCallExpressionType,
	resolvePinMemberValue,
} from "./type-resolution.js";

export const NOT_HANDLED = Symbol("notHandled");

export const resolveParameterHover = (context) => {
	const parameterHover = findParameterInfo(
		context.syntaxTree,
		context.comments,
		context.name,
	);

	return parameterHover ?? NOT_HANDLED;
};

const resolveVariableDisplayType = (variableDeclaration, context) => {
	const init = variableDeclaration.declarations?.[0]?.init;
	const callType = resolveCallExpressionType(
		init,
		context.allExports,
		context.importAliases,
	);
	const variableType =
		callType ??
		resolveVariableType(
			context.syntaxTree,
			variableDeclaration,
			context.wordType,
			context.resolveNameType,
			context.resolveCallType,
			context.hoverWordSize,
			context.objectTypes,
		) ??
		context.wordType;
	const narrowedVariableType =
		context.identifier &&
		isNarrowedAt(
			context.name,
			context.identifier?.loc,
			context.narrowingRegions,
		)
			? getNonNullableType(variableType)
			: variableType;

	return { variableType, narrowedVariableType };
};

const resolveVariableValue = (variableDeclaration, variableType, context) => {
	const floatContext =
		variableType === DATA_TYPE.f32 || variableType === DATA_TYPE.f64
			? variableType
			: null;
	const initializer = variableDeclaration.declarations?.[0]?.init;
	const pinValue = resolvePinMemberValue(
		initializer,
		context.hoverPlatform,
		context.allExports,
	);

	if (pinValue !== null) {
		return pinValue;
	}

	return evaluateConstant(context.syntaxTree, initializer, floatContext);
};

const buildFunctionHover = (context, functionExpression) => {
	const signature = getFunctionSignature(
		functionExpression,
		context.resolveNameType,
		context.resolveCallType,
		context.hoverWordSize,
		context.syntaxTree,
		context.objectTypes,
	);

	if (!signature) {
		return null;
	}

	return {
		contents: {
			kind: "markdown",
			value: `\`\`\`e95\n${context.name}: ${signature}\n\`\`\``,
		},
	};
};

export const resolveVariableHover = (context) => {
	const variableDeclaration = findVariableDeclaration(
		context.syntaxTree,
		context.name,
	);

	if (!variableDeclaration) {
		return NOT_HANDLED;
	}

	const docComment = getDocComment(
		context.comments,
		variableDeclaration.loc?.start?.line,
	);
	const docSection = formatDocComment(docComment);

	// A local closure is a `const` whose initializer is a function expression.
	// Its data type is not declared, so hovering it must show the callable
	// signature (the closure returned by a factory is one of these) while
	// keeping the doc-comment of the declaration.
	const initializer = variableDeclaration.declarations?.[0]?.init;
	if (initializer?.type === AST_NODE.functionExpression) {
		const functionHover = buildFunctionHover(context, initializer);
		if (!functionHover) {
			return NOT_HANDLED;
		}
		return {
			contents: {
				kind: "markdown",
				value: functionHover.contents.value + docSection,
			},
		};
	}
	const { variableType, narrowedVariableType } = resolveVariableDisplayType(
		variableDeclaration,
		context,
	);
	const resolvedValue = resolveVariableValue(
		variableDeclaration,
		variableType,
		context,
	);
	const valueSuffix =
		resolvedValue !== null
			? ` = ${formatHoverValue(resolvedValue, narrowedVariableType)}`
			: "";
	const displayType = formatObjectShapeType(narrowedVariableType);
	const signature = `\`\`\`e95\n${variableDeclaration.kind} ${context.name}: ${displayType}${valueSuffix}\n\`\`\``;

	return {
		contents: {
			kind: "markdown",
			value:
				signature +
				docSection +
				formatCastWarningsSection(
					context.line,
					context.column,
					context.allCastWarnings,
				),
		},
	};
};

export const resolveFunctionHover = (context) => {
	const functionExpression = findFunctionDeclaration(
		context.syntaxTree,
		context.name,
	);

	if (!functionExpression) {
		return NOT_HANDLED;
	}

	return buildFunctionHover(context, functionExpression);
};
