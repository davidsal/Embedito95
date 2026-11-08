import { AST_NODE, ERROR_CODE, TOKEN_TYPE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import {
	parseEnumDeclaration,
	parseTypeDeclaration,
	parseVariableDeclaration,
} from "./declarations.js";
import { parseExpression } from "./expressions.js";
import { parseImportDeclaration } from "./imports.js";
import { makeLocation } from "./location.js";
import {
	acceptSemicolon,
	consume,
	ensureParserProgress,
	expectRequired,
	expectRequiredOrEof,
	peek,
	reportUnexpectedToken,
} from "./token-stream.js";
import { VARIABLE_KINDS } from "./tokens.js";

export const parseBlockStatement = (context) => {
	const start = expectRequiredOrEof(context, TOKEN_TYPE.leftBrace);
	if (!start && peek(context).type === TOKEN_TYPE.eof) {
		return {
			type: AST_NODE.blockStatement,
			body: [],
			loc: makeLocation(peek(context), peek(context)),
		};
	}
	const body = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightBrace &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		const positionBefore = context.position;
		body.push(parseStatement(context));
		ensureParserProgress(context, positionBefore);
	}
	const end = expectRequiredOrEof(context, TOKEN_TYPE.rightBrace);
	return {
		type: AST_NODE.blockStatement,
		body,
		loc: makeLocation(
			start || end || peek(context),
			end || start || peek(context),
		),
	};
};

const parseReturnStatement = (context) => {
	const start = consume(context);
	let argument = null;
	if (
		peek(context).type !== TOKEN_TYPE.rightBrace &&
		peek(context).type !== TOKEN_TYPE.semicolon &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		argument = parseExpression(context);
	}
	acceptSemicolon(context);
	const end = peek(context);
	return {
		type: AST_NODE.returnStatement,
		argument,
		loc: makeLocation(start, end),
	};
};

const parseWhileStatement = (context) => {
	const start = consume(context);
	expectRequired(context, TOKEN_TYPE.leftParenthesis);
	const test = parseExpression(context);
	expectRequired(context, TOKEN_TYPE.rightParenthesis);
	const body = parseBlockStatement(context);
	const end = peek(context);
	return {
		type: AST_NODE.whileStatement,
		test,
		body,
		loc: makeLocation(start, end),
	};
};

const parseForInit = (context) => {
	if (
		peek(context).type === TOKEN_TYPE.keyword &&
		VARIABLE_KINDS.has(peek(context).value)
	) {
		return parseVariableDeclaration(context);
	}
	if (peek(context).type !== TOKEN_TYPE.semicolon) {
		const init = parseExpression(context);
		expectRequired(context, TOKEN_TYPE.semicolon);
		return init;
	}
	expectRequired(context, TOKEN_TYPE.semicolon);
	return null;
};

const parseForStatement = (context) => {
	const start = consume(context);
	expectRequired(context, TOKEN_TYPE.leftParenthesis);

	const init = parseForInit(context);

	let test = null;
	if (peek(context).type !== TOKEN_TYPE.semicolon) {
		test = parseExpression(context);
	}
	expectRequired(context, TOKEN_TYPE.semicolon);

	let update = null;
	if (peek(context).type !== TOKEN_TYPE.rightParenthesis) {
		update = parseExpression(context);
	}
	expectRequired(context, TOKEN_TYPE.rightParenthesis);

	const body = parseBlockStatement(context);
	const end = peek(context);
	return {
		type: AST_NODE.forStatement,
		init,
		test,
		update,
		body,
		loc: makeLocation(start, end),
	};
};

const parseDoWhileStatement = (context) => {
	const start = consume(context);
	const body = parseBlockStatement(context);
	const whileToken = peek(context);
	if (whileToken.type !== TOKEN_TYPE.keyword || whileToken.value !== "while") {
		reportUnexpectedToken(context, "'while'", whileToken);
	} else {
		consume(context);
	}
	expectRequired(context, TOKEN_TYPE.leftParenthesis);
	const test = parseExpression(context);
	expectRequired(context, TOKEN_TYPE.rightParenthesis);
	acceptSemicolon(context);
	const end = peek(context);
	return {
		type: AST_NODE.doWhileStatement,
		body,
		test,
		loc: makeLocation(start, end),
	};
};

const parseIfStatement = (context) => {
	const start = consume(context);
	expectRequired(context, TOKEN_TYPE.leftParenthesis);
	const test = parseExpression(context);
	expectRequired(context, TOKEN_TYPE.rightParenthesis);
	const consequent = parseBlockStatement(context);
	let alternate = null;
	if (
		peek(context).type === TOKEN_TYPE.keyword &&
		peek(context).value === "else"
	) {
		consume(context);
		if (
			peek(context).type === TOKEN_TYPE.keyword &&
			peek(context).value === "if"
		) {
			alternate = parseIfStatement(context);
		} else {
			alternate = parseBlockStatement(context);
		}
	}
	const end = peek(context);
	return {
		type: AST_NODE.ifStatement,
		test,
		consequent,
		alternate,
		loc: makeLocation(start, end),
	};
};

const isSwitchClauseStart = (token) => {
	return (
		token.type === TOKEN_TYPE.keyword &&
		(token.value === "case" || token.value === "default")
	);
};

const parseSwitchCase = (context) => {
	const start = consume(context);
	let test = null;
	if (start.value === "case") {
		test = parseExpression(context);
	}
	expectRequired(context, TOKEN_TYPE.colon);
	const consequent = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightBrace &&
		peek(context).type !== TOKEN_TYPE.eof &&
		!isSwitchClauseStart(peek(context))
	) {
		const positionBefore = context.position;
		consequent.push(parseStatement(context));
		ensureParserProgress(context, positionBefore);
	}
	return {
		type: AST_NODE.switchCase,
		test,
		consequent,
		loc: makeLocation(start, peek(context)),
	};
};

const parseSwitchStatement = (context) => {
	const start = consume(context);
	expectRequired(context, TOKEN_TYPE.leftParenthesis);
	const discriminant = parseExpression(context);
	expectRequired(context, TOKEN_TYPE.rightParenthesis);
	expectRequired(context, TOKEN_TYPE.leftBrace);
	const cases = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightBrace &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		if (!isSwitchClauseStart(peek(context))) {
			reportUnexpectedToken(context, "'case', 'default' or '}'");
			break;
		}
		cases.push(parseSwitchCase(context));
	}
	const end = expectRequiredOrEof(context, TOKEN_TYPE.rightBrace);
	return {
		type: AST_NODE.switchStatement,
		discriminant,
		cases,
		loc: makeLocation(start, end || peek(context)),
	};
};

const parseBreakStatement = (context) => {
	const start = consume(context);
	acceptSemicolon(context);
	const end = peek(context);
	return {
		type: AST_NODE.breakStatement,
		loc: makeLocation(start, end),
	};
};

const parseExpressionStatement = (context) => {
	const start = peek(context);
	const expression = parseExpression(context);
	acceptSemicolon(context);
	const end = peek(context);
	if (expression?.type === AST_NODE.identifier) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.expectedStatement,
				params: { name: expression.name },
				location: expression.loc,
			}),
		);
	}
	return {
		type: AST_NODE.expressionStatement,
		expression,
		loc: makeLocation(start, end),
	};
};

const parseExportStatement = (context) => {
	consume(context);
	if (peek(context).type === TOKEN_TYPE.keyword) {
		if (peek(context).value === "const") {
			const declaration = parseVariableDeclaration(context);
			declaration.export = true;
			return declaration;
		}
		if (peek(context).value === "enum") {
			const declaration = parseEnumDeclaration(context);
			declaration.export = true;
			return declaration;
		}
		if (peek(context).value === "type") {
			const declaration = parseTypeDeclaration(context);
			declaration.export = true;
			return declaration;
		}
	}
	reportUnexpectedToken(context, "'const', 'enum' or 'type' after 'export'");
	return {
		type: AST_NODE.variableDeclaration,
		kind: "const",
		declarations: [],
		loc: makeLocation(peek(context), peek(context)),
	};
};

const parseStatementNode = (context) => {
	const token = peek(context);
	if (token.type !== TOKEN_TYPE.keyword) {
		return parseExpressionStatement(context);
	}
	if (token.value === "import") {
		return parseImportDeclaration(context);
	}
	if (token.value === "const" || token.value === "let") {
		return parseVariableDeclaration(context);
	}
	if (token.value === "while") {
		return parseWhileStatement(context);
	}
	if (token.value === "for") {
		return parseForStatement(context);
	}
	if (token.value === "do") {
		return parseDoWhileStatement(context);
	}
	if (token.value === "if") {
		return parseIfStatement(context);
	}
	if (token.value === "switch") {
		return parseSwitchStatement(context);
	}
	if (token.value === "break") {
		return parseBreakStatement(context);
	}
	if (token.value === "return") {
		return parseReturnStatement(context);
	}
	if (token.value === "enum") {
		return parseEnumDeclaration(context);
	}
	if (token.value === "type") {
		return parseTypeDeclaration(context);
	}
	if (token.value === "export") {
		return parseExportStatement(context);
	}
	return parseExpressionStatement(context);
};

export const parseStatement = (context) => {
	const previousStatementId = context.currentStatementId;
	context.currentStatementId = context.nextStatementId++;
	const statement = parseStatementNode(context);
	context.currentStatementId = previousStatementId;
	return statement;
};
