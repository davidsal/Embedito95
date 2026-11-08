import { AST_NODE, DATA_TYPE, evaluateConstant } from "embedito95-core";
import {
	formatDocComment,
	getDocComment,
	getEnumMemberDoc,
} from "../shared/doc-comments.js";
import {
	computeEnumType,
	formatCastWarningsSection,
	formatObjectMemberSignature,
} from "./formatting.js";
import { getFunctionSignature } from "./function-signature.js";
import { NOT_HANDLED } from "./local-steps.js";
import {
	formatHoverValue,
	resolveConstType,
	resolvePinMemberValue,
} from "./type-resolution.js";

const buildFunctionVariableHover = (statement, declaration, context) => {
	const signature = getFunctionSignature(
		declaration.init,
		context.resolveNameType,
		context.resolveCallType,
		context.hoverWordSize,
		context.syntaxTree,
		context.objectTypes,
	);

	if (!signature) {
		return null;
	}

	const docSection = getDocComment(
		context.comments,
		statement.loc?.start?.line,
	);
	return {
		contents: {
			kind: "markdown",
			value:
				"```e95\n" +
				statement.kind +
				" " +
				context.name +
				": " +
				signature +
				"\n```" +
				formatDocComment(docSection),
		},
	};
};

const buildLiteralVariableHover = (statement, declaration, context) => {
	const value = declaration.init.value;
	const type = resolveConstType(declaration, value);

	if (!type) {
		return NOT_HANDLED;
	}

	const docComment = getDocComment(
		context.comments,
		statement.loc?.start?.line,
	);
	const docSection = formatDocComment(docComment);

	return {
		contents: {
			kind: "markdown",
			value:
				"```e95\n" +
				statement.kind +
				" " +
				context.name +
				": " +
				type +
				(statement.kind === "const" && value !== null
					? ` = ${formatHoverValue(value, type)}`
					: "") +
				"\n```" +
				docSection +
				formatCastWarningsSection(
					context.line,
					context.column,
					context.allCastWarnings,
				),
		},
	};
};

const handleVariableDeclarationHover = (statement, context) => {
	const declaration = statement.declarations[0];

	if (declaration?.id?.name !== context.name) {
		return NOT_HANDLED;
	}

	if (declaration.init?.type === AST_NODE.functionExpression) {
		return buildFunctionVariableHover(statement, declaration, context);
	}

	if (declaration.init?.type === AST_NODE.literal) {
		return buildLiteralVariableHover(statement, declaration, context);
	}

	return NOT_HANDLED;
};

const buildEnumDeclarationHover = (statement, context) => {
	const membersList = statement.members
		.map((member) => `- ${member.name}`)
		.join("\n");
	const signature = `\`\`\`e95\nenum ${context.name}\n\`\`\``;
	const membersSection = membersList ? `\n\n**Members:**\n${membersList}` : "";

	return {
		contents: {
			kind: "markdown",
			value: signature + getDocSection(statement, context) + membersSection,
		},
	};
};

const buildEnumMemberHover = (statement, context) => {
	const memberDoc = getEnumMemberDoc(context.comments, context.name);
	const memberSection = formatDocComment(memberDoc);
	const signature =
		"```e95\n" +
		statement.name +
		"." +
		context.name +
		": " +
		statement.name +
		"\n```";

	return {
		contents: {
			kind: "markdown",
			value: signature + memberSection,
		},
	};
};

const handleEnumDeclarationHover = (statement, context) => {
	computeEnumType(statement.members);

	if (statement.name === context.name) {
		return buildEnumDeclarationHover(statement, context);
	}

	const member = statement.members.find(
		(memberItem) => memberItem.name === context.name,
	);

	if (member) {
		return buildEnumMemberHover(statement, context);
	}

	return NOT_HANDLED;
};

const handleTypeDeclarationHover = (statement, context) => {
	if (statement.name !== context.name) {
		return NOT_HANDLED;
	}

	const memberLines = statement.members.map(
		(member) => `    ${formatObjectMemberSignature(member)}`,
	);
	const body =
		memberLines.length > 0 ? `{\n${memberLines.join(",\n")}\n}` : "{}";
	const signature = `\`\`\`e95\ntype ${context.name} = ${body}\n\`\`\``;

	return {
		contents: {
			kind: "markdown",
			value: signature + getDocSection(statement, context),
		},
	};
};

const getDocSection = (statement, context) => {
	const docComment = getDocComment(
		context.comments,
		statement.loc?.start?.line,
	);
	return formatDocComment(docComment);
};

const resolveSingleStatementHover = (statement, context) => {
	if (statement.type === AST_NODE.variableDeclaration) {
		return handleVariableDeclarationHover(statement, context);
	}

	if (statement.type === AST_NODE.enumDeclaration) {
		return handleEnumDeclarationHover(statement, context);
	}

	if (statement.type === AST_NODE.typeDeclaration) {
		return handleTypeDeclarationHover(statement, context);
	}

	return NOT_HANDLED;
};

export const resolveStatementDeclarationHover = (context) => {
	for (const statement of context.syntaxTree.body) {
		const result = resolveSingleStatementHover(statement, context);

		if (result !== NOT_HANDLED) {
			return result;
		}
	}

	return NOT_HANDLED;
};

const resolveVariableTypeAndValue = (declaration, context) => {
	const { syntaxTree, variableTypes } = context;

	if (declaration?.init?.type === AST_NODE.memberExpression) {
		const pinValue = resolvePinMemberValue(
			declaration.init,
			context.hoverPlatform,
			context.allExports,
		);

		if (pinValue !== null) {
			return { variableType: "Pin", resolvedValue: pinValue };
		}

		return { variableType: "unknown", resolvedValue: undefined };
	}

	const resolvedType = variableTypes.get(context.name);
	const floatContext =
		resolvedType === DATA_TYPE.f32 || resolvedType === DATA_TYPE.f64
			? resolvedType
			: null;
	const resolvedConstant = evaluateConstant(
		syntaxTree,
		declaration.init,
		floatContext,
	);

	if (resolvedConstant !== null) {
		return {
			variableType:
				resolvedType ?? resolveConstType(declaration, resolvedConstant),
			resolvedValue: resolvedConstant,
		};
	}

	return { variableType: "unknown", resolvedValue: undefined };
};

export const resolveResolvedVariableHover = (context) => {
	for (const statement of context.syntaxTree.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}

		const declaration = statement.declarations?.[0];

		if (declaration?.id?.name !== context.name) {
			continue;
		}

		if (declaration?.init?.type === AST_NODE.functionExpression) {
			break;
		}

		const { variableType, resolvedValue } = resolveVariableTypeAndValue(
			declaration,
			context,
		);
		const valueSuffix =
			resolvedValue !== undefined
				? ` = ${formatHoverValue(resolvedValue, variableType)}`
				: "";
		const signature = `\`\`\`e95\nconst ${context.name}: ${variableType}${valueSuffix}\n\`\`\``;

		return {
			contents: {
				kind: "markdown",
				value:
					signature +
					formatCastWarningsSection(
						context.line,
						context.column,
						context.allCastWarnings,
					),
			},
		};
	}

	return NOT_HANDLED;
};
