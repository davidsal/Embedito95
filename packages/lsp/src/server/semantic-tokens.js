import { AST_NODE, parse, tokenize, walk } from "embedito95-core";
import { SemanticTokensBuilder } from "vscode-languageserver";
import {
	collectImportedTypeNames,
	collectLibraryEnumMembers,
	collectLibraryTypeNames,
	collectLocalEnumMembers,
	collectLocalTypeNames,
	collectUnreachableStatements,
	isOverlappingStatement,
} from "./semantic-token-collectors.js";

const COMMENT_TYPE_INDEX = 0;
const TYPE_TYPE_INDEX = 1;
const ENUM_MEMBER_TYPE_INDEX = 2;
const UNNECESSARY_MODIFIER_INDEX = 0;
const NO_MODIFIER_INDEX = 0;

export const SEMANTIC_TOKEN_LEGEND = {
	tokenTypes: ["comment", "type", "enumMember"],
	tokenModifiers: ["unnecessary"],
};

const pushCommentToken = (tokens, line, character, length) => {
	tokens.push({
		line,
		char: character,
		length,
		typeIndex: COMMENT_TYPE_INDEX,
		modifierIndex: UNNECESSARY_MODIFIER_INDEX,
	});
};

const pushStatementTokens = (tokens, sourceLines, statement) => {
	const { start, end } = statement.loc ?? {};
	if (!start || !end) {
		return;
	}

	if (start.line === end.line) {
		pushCommentToken(
			tokens,
			start.line - 1,
			start.column - 1,
			end.column - start.column,
		);
		return;
	}

	pushCommentToken(
		tokens,
		start.line - 1,
		start.column - 1,
		sourceLines[start.line - 1].length - (start.column - 1),
	);
	for (let line = start.line + 1; line < end.line; line++) {
		pushCommentToken(tokens, line - 1, 0, sourceLines[line - 1].length);
	}
	const endLineText = sourceLines[end.line - 1] ?? "";
	const endPrefix = endLineText.slice(0, end.column - 1);
	if (end.column - 1 > 0 && /\S/.test(endPrefix)) {
		pushCommentToken(tokens, end.line - 1, 0, end.column - 1);
	}
};

const pushTypeToken = (tokens, unreachableStatements, location) => {
	const { start, end } = location ?? {};
	if (!start || !end) {
		return;
	}

	const line = start.line - 1;
	const column = start.column - 1;

	if (isOverlappingStatement(unreachableStatements, line + 1, start.column)) {
		return;
	}

	tokens.push({
		line,
		char: column,
		length: end.column - start.column,
		typeIndex: TYPE_TYPE_INDEX,
		modifierIndex: NO_MODIFIER_INDEX,
	});
};

const pushAnnotationTokens = (annotation, context) => {
	if (!annotation) {
		return;
	}

	const members = annotation.members ?? [];

	if (members.length > 0) {
		for (const member of members) {
			if (context.typeNames.has(member.name)) {
				pushTypeToken(
					context.tokens,
					context.unreachableStatements,
					member.loc,
				);
			}
		}
		return;
	}

	if (context.typeNames.has(annotation.type)) {
		pushTypeToken(
			context.tokens,
			context.unreachableStatements,
			annotation.loc,
		);
	}
};

const pushTypeMemberAnnotations = (members, context) => {
	for (const member of members ?? []) {
		for (const parameter of member.params ?? []) {
			pushAnnotationTokens(parameter.typeAnnotation, context);
		}
		pushAnnotationTokens(member.returnTypeAnnotation, context);
	}
};

const pushTypeTokens = (
	syntaxTree,
	typeNames,
	unreachableStatements,
	tokens,
) => {
	const context = { typeNames, unreachableStatements, tokens };

	walk(syntaxTree, {
		enter: (node) => {
			if (
				(node.type === AST_NODE.enumDeclaration ||
					node.type === AST_NODE.typeDeclaration) &&
				node.nameIdent
			) {
				pushTypeToken(tokens, unreachableStatements, node.nameIdent.loc);
				if (node.type === AST_NODE.typeDeclaration) {
					pushTypeMemberAnnotations(node.members, context);
				}
				return;
			}

			if (node.type === AST_NODE.memberExpression) {
				const object = node.object;

				if (
					object?.type === AST_NODE.identifier &&
					typeNames.has(object.name)
				) {
					pushTypeToken(tokens, unreachableStatements, object.loc);
				}
				return;
			}

			if (node.type === AST_NODE.identifier && node.typeAnnotation) {
				pushAnnotationTokens(node.typeAnnotation, context);
				return;
			}

			if (node.type === AST_NODE.functionExpression && node.returnType) {
				if (typeNames.has(node.returnType.name)) {
					pushTypeToken(tokens, unreachableStatements, node.returnType.loc);
				}
			}
		},
	});
};

const pushEnumMemberTokens = (syntaxTree, enumMembers, tokens) => {
	walk(syntaxTree, {
		enter: (node) => {
			if (
				node.type !== AST_NODE.memberExpression ||
				node.object?.type !== AST_NODE.identifier
			) {
				return;
			}

			if (!enumMembers[node.object.name]?.has(String(node.property?.name))) {
				return;
			}

			const { start, end } = node.property?.loc ?? {};
			if (!start || !end) {
				return;
			}

			tokens.push({
				line: start.line - 1,
				char: start.column - 1,
				length: end.column - start.column,
				typeIndex: ENUM_MEMBER_TYPE_INDEX,
				modifierIndex: NO_MODIFIER_INDEX,
			});
		},
	});
};

export const getSemanticTokens = (source, libraries) => {
	const { tokens: lexTokens } = tokenize(source);
	const { ast: syntaxTree } = parse(lexTokens);
	const sourceLines = source.split("\n");
	const tokens = [];
	const unreachableStatements = collectUnreachableStatements(syntaxTree);

	for (const statement of unreachableStatements) {
		pushStatementTokens(tokens, sourceLines, statement);
	}

	const typeNames = new Set([
		...collectLocalTypeNames(syntaxTree),
		...collectImportedTypeNames(syntaxTree, collectLibraryTypeNames(libraries)),
	]);

	if (typeNames.size > 0) {
		pushTypeTokens(syntaxTree, typeNames, unreachableStatements, tokens);
	}

	const enumMembers = {
		...collectLocalEnumMembers(syntaxTree),
		...collectLibraryEnumMembers(libraries),
	};

	if (Object.keys(enumMembers).length > 0) {
		pushEnumMemberTokens(syntaxTree, enumMembers, tokens);
	}

	tokens.sort((a, b) => {
		return a.line - b.line || a.char - b.char;
	});

	const builder = new SemanticTokensBuilder();

	for (const token of tokens) {
		builder.push(
			token.line,
			token.char,
			token.length,
			token.typeIndex,
			token.modifierIndex,
		);
	}

	return builder.build();
};
