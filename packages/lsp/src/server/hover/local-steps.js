import {
	AST_NODE,
	DATA_TYPE,
	evaluateConstant,
	getNonNullableType,
	isNarrowedAt,
	resolveVariableType,
} from "embedito95-core";
import { formatDocComment, getDocComment } from "../shared/doc-comments.js";
import { findLibraryFunctionExport } from "../shared/type-inference.js";
import {
	findFunctionDeclaration,
	findVariableDeclaration,
} from "./ast-finders.js";
import { findParameterInfo } from "./doc-sections.js";
import {
	formatCastWarningsSection,
	formatObjectShapeType,
} from "./formatting.js";
import {
	getFunctionSignature,
	getLibraryFunctionSignature,
} from "./function-signature.js";
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
		context.line,
		context.column,
	);

	return parameterHover ?? NOT_HANDLED;
};

const FUNCTION_TYPE_PATTERN = /^\(.*\)\s*=>/;

// A `const p = fn` binds the callable value, not its return type, so the hover
// renders the function signature: the local declaration or the library export
// the identifier names.
const resolveFunctionValueType = (initializer, context) => {
	if (initializer?.type !== AST_NODE.identifier) {
		return null;
	}

	const localFunction = findFunctionDeclaration(
		context.syntaxTree,
		initializer.name,
	);

	if (localFunction) {
		return getFunctionSignature(
			localFunction,
			context.resolveNameType,
			context.resolveCallType,
			context.hoverWordSize,
			context.syntaxTree,
			context.objectTypes,
		);
	}

	const libraryFunction = findLibraryFunctionExport(
		initializer.name,
		context.allExports,
		context.importAliases,
	);

	if (libraryFunction) {
		return getLibraryFunctionSignature(libraryFunction);
	}

	return null;
};

// Returns `false` only when the callee resolves to a known value that is not
// callable (a scalar, an object or an `AsyncTask`); `null` means the name is
// unknown, so the initializer keeps the regular value/word-type inference.
const resolveCallableStatus = (callee, context) => {
	const name = callee?.name;

	if (!name) {
		return null;
	}

	if (findFunctionDeclaration(context.syntaxTree, name)) {
		return true;
	}

	if (
		findLibraryFunctionExport(name, context.allExports, context.importAliases)
	) {
		return true;
	}

	const valueType = context.resolveNameType?.(name, callee.loc);

	if (!valueType) {
		return null;
	}

	return FUNCTION_TYPE_PATTERN.test(valueType);
};

// `const x = n()` with a non-callable `n` has no usable type: the word-type
// fallback would invent `i16`, so the hover must report no type instead.
const isNonCallableCall = (initializer, context) => {
	if (initializer?.type !== AST_NODE.callExpression) {
		return false;
	}

	return resolveCallableStatus(initializer.callee, context) === false;
};

const resolveVariableDisplayType = (variableDeclaration, context) => {
	const init = variableDeclaration.declarations?.[0]?.init;
	// Fall back to `context.wordType` only for genuinely unknown initializers
	// (no initializer, or an expression that resolves to no type at all).
	const inferredType =
		resolveCallExpressionType(init, context) ??
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
	const functionValueType = resolveFunctionValueType(init, context);
	const variableType =
		functionValueType ??
		(isNonCallableCall(init, context) ? null : inferredType);
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

	// A call to a non-callable value has no type to show; returning `null`
	// stops the hover chain so the editor displays nothing for the declaration.
	if (variableType === null) {
		return null;
	}

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
