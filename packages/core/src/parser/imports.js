import {
	AST_NODE,
	ERROR_CODE,
	LITERAL_VALUES,
	TOKEN_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { extendLocation, makeLocation, makeTokenRange } from "./location.js";
import {
	acceptSemicolon,
	consume,
	expectRequired,
	peek,
	reportParserError,
	reportUnexpectedToken,
} from "./token-stream.js";
import { STATEMENT_START_KEYWORDS, TOKEN_LABELS } from "./tokens.js";

export const parseIdentifier = (context) => {
	const token = consume(context);
	return {
		type: AST_NODE.identifier,
		name: token.value,
		loc: makeLocation(token, extendLocation(token)),
	};
};

const isNumericLiteralRaw = (raw) => {
	return /^-?\d/.test(raw);
};

const isFloatLiteralRaw = (raw) => {
	return raw.includes(".") || raw.includes("e") || raw.includes("E");
};

export const parseLiteral = (context) => {
	const token = consume(context);
	const literalValue = LITERAL_VALUES.get(token.value);
	const value =
		literalValue !== undefined
			? literalValue
			: isNumericLiteralRaw(token.value)
				? isFloatLiteralRaw(token.value)
					? parseFloat(token.value)
					: parseInt(token.value, 10)
				: token.value;
	return {
		type: AST_NODE.literal,
		value,
		raw: token.value,
		quote: token.quote,
		loc: makeLocation(token, extendLocation(token)),
	};
};

const parseImportSpecifier = (context) => {
	const token = peek(context);
	if (token.type !== TOKEN_TYPE.identifier) {
		reportParserError(
			context,
			makeDiagnostic({
				code: ERROR_CODE.unexpectedToken,
				params: {
					expected: "identifier",
					found: `${token.type} "${token.value}"`,
				},
				location: makeTokenRange(token),
			}),
		);
		consume(context);
		return null;
	}
	const identifier = consume(context);
	let alias = null;
	let end = extendLocation(identifier);
	if (
		peek(context).type === TOKEN_TYPE.identifier &&
		peek(context).value === "as"
	) {
		consume(context);
		const aliasToken = expectRequired(context, TOKEN_TYPE.identifier);
		if (aliasToken) {
			alias = aliasToken.value;
			end = extendLocation(aliasToken);
		}
	}
	return {
		type: AST_NODE.importSpecifier,
		name: identifier.value,
		alias,
		loc: makeLocation(identifier, end),
	};
};

const makeImportDeclarationNode = ({ start, end, specifiers, sourceToken }) => {
	return {
		type: AST_NODE.importDeclaration,
		specifiers,
		source: sourceToken ? sourceToken.value : "",
		sourceLoc: sourceToken
			? {
					start: { line: sourceToken.line, column: sourceToken.column },
					end: {
						line: sourceToken.line,
						column: sourceToken.column + sourceToken.value.length + 1,
					},
				}
			: null,
		loc: makeLocation(start, end),
	};
};

const IMPORT_SPECIFIER_RECOVERY_TYPES = new Set([
	TOKEN_TYPE.semicolon,
	TOKEN_TYPE.rightParenthesis,
	TOKEN_TYPE.rightBracket,
]);

const isImportSpecifierRecoveryBoundary = (token) => {
	if (IMPORT_SPECIFIER_RECOVERY_TYPES.has(token.type)) {
		return true;
	}
	return (
		token.type === TOKEN_TYPE.keyword &&
		STATEMENT_START_KEYWORDS.has(token.value)
	);
};

const canParseImportSpecifier = (token) => {
	return (
		token.type !== TOKEN_TYPE.rightBrace &&
		token.type !== TOKEN_TYPE.eof &&
		!isImportSpecifierRecoveryBoundary(token)
	);
};

const reportMissingImportRightBrace = (context) => {
	reportUnexpectedToken(
		context,
		TOKEN_LABELS[TOKEN_TYPE.rightBrace],
		peek(context),
		TOKEN_TYPE.rightBrace,
	);
	return null;
};

export const parseImportDeclaration = (context) => {
	const start = consume(context);
	expectRequired(context, TOKEN_TYPE.leftBrace);
	const specifiers = [];
	while (canParseImportSpecifier(peek(context))) {
		const specifier = parseImportSpecifier(context);
		if (specifier) {
			specifiers.push(specifier);
		}
		if (peek(context).type === TOKEN_TYPE.identifier) {
			reportUnexpectedToken(context, TOKEN_LABELS[TOKEN_TYPE.comma] || '","');
		}
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
		}
	}
	const closeBrace = isImportSpecifierRecoveryBoundary(peek(context))
		? reportMissingImportRightBrace(context)
		: expectRequired(context, TOKEN_TYPE.rightBrace);

	if (!closeBrace) {
		return makeImportDeclarationNode({
			start,
			end: peek(context),
			specifiers,
			sourceToken: null,
		});
	}

	if (specifiers.length === 0) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.emptyImport,
				location: makeTokenRange(closeBrace),
			}),
		);
	}

	expectRequired(context, TOKEN_TYPE.keyword);
	const sourceToken = expectRequired(context, TOKEN_TYPE.string);

	if (sourceToken && sourceToken.value === "") {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.emptyImportSource,
				location: makeTokenRange(sourceToken),
			}),
		);
	}

	acceptSemicolon(context);
	return makeImportDeclarationNode({
		start,
		end: peek(context),
		specifiers,
		sourceToken,
	});
};
