import { PUNCTUATION } from "../ast.js";
import { AWAIT_KEYWORD, LITERAL_KEYWORDS, TOKEN_TYPE } from "../constants.js";

export const TOKEN_LABELS = {
	...Object.fromEntries(PUNCTUATION.map(({ type, label }) => [type, label])),
	[TOKEN_TYPE.keyword]: "keyword",
	[TOKEN_TYPE.identifier]: "identifier",
	[TOKEN_TYPE.string]: "string",
	[TOKEN_TYPE.template]: "template literal",
	[TOKEN_TYPE.number]: "number",
	[TOKEN_TYPE.plus]: '"+"',
	[TOKEN_TYPE.minus]: '"-"',
	[TOKEN_TYPE.star]: '"*"',
	[TOKEN_TYPE.slash]: '"/"',
	[TOKEN_TYPE.percent]: '"%"',
	[TOKEN_TYPE.lessThan]: '"<"',
	[TOKEN_TYPE.greaterThan]: '">"',
	[TOKEN_TYPE.lessThanOrEqual]: '"<="',
	[TOKEN_TYPE.greaterThanOrEqual]: '">="',
	[TOKEN_TYPE.equalEqual]: '"=="',
	[TOKEN_TYPE.notEqual]: '"!="',
	[TOKEN_TYPE.strictEqual]: '"==="',
	[TOKEN_TYPE.strictNotEqual]: '"!=="',
	[TOKEN_TYPE.ampersandAmpersand]: '"&&"',
	[TOKEN_TYPE.pipePipe]: '"||"',
	[TOKEN_TYPE.nullishCoalescing]: '"??"',
	[TOKEN_TYPE.plusPlus]: '"++"',
	[TOKEN_TYPE.minusMinus]: '"--"',
	[TOKEN_TYPE.plusEqual]: '"+="',
	[TOKEN_TYPE.minusEqual]: '"-="',
	[TOKEN_TYPE.starEqual]: '"*="',
	[TOKEN_TYPE.slashEqual]: '"/="',
	[TOKEN_TYPE.percentEqual]: '"%="',
	[TOKEN_TYPE.bang]: '"!"',
};

export const BINARY_PRECEDENCE = {
	[TOKEN_TYPE.nullishCoalescing]: 1,
	[TOKEN_TYPE.pipePipe]: 1,
	[TOKEN_TYPE.ampersandAmpersand]: 2,
	[TOKEN_TYPE.equalEqual]: 3,
	[TOKEN_TYPE.notEqual]: 3,
	[TOKEN_TYPE.lessThan]: 4,
	[TOKEN_TYPE.greaterThan]: 4,
	[TOKEN_TYPE.lessThanOrEqual]: 4,
	[TOKEN_TYPE.greaterThanOrEqual]: 4,
	[TOKEN_TYPE.plus]: 5,
	[TOKEN_TYPE.minus]: 5,
	[TOKEN_TYPE.star]: 6,
	[TOKEN_TYPE.slash]: 6,
	[TOKEN_TYPE.percent]: 6,
};

export const ASSIGNMENT_OPERATORS = new Set([
	TOKEN_TYPE.equal,
	TOKEN_TYPE.plusEqual,
	TOKEN_TYPE.minusEqual,
	TOKEN_TYPE.starEqual,
	TOKEN_TYPE.slashEqual,
	TOKEN_TYPE.percentEqual,
]);

export const UNARY_OPERATORS = new Set([
	TOKEN_TYPE.minus,
	TOKEN_TYPE.bang,
	TOKEN_TYPE.plusPlus,
	TOKEN_TYPE.minusMinus,
]);

export const UPDATE_OPERATORS = new Set([
	TOKEN_TYPE.plusPlus,
	TOKEN_TYPE.minusMinus,
]);

export const VARIABLE_KINDS = new Set(["const", "let"]);

export const STATEMENT_START_KEYWORDS = new Set([
	"import",
	"const",
	"let",
	"while",
	"for",
	"do",
	"if",
	"switch",
	"break",
	"return",
	"enum",
	"type",
	"export",
	"async",
	"function",
]);

export const isLiteralKeyword = (token) => {
	return token.type === TOKEN_TYPE.keyword && LITERAL_KEYWORDS.has(token.value);
};

export const isExpressionStart = (token) =>
	token.type === TOKEN_TYPE.identifier ||
	isNameToken(token) ||
	token.type === TOKEN_TYPE.number ||
	token.type === TOKEN_TYPE.string ||
	token.type === TOKEN_TYPE.template ||
	token.type === TOKEN_TYPE.leftBracket ||
	token.type === TOKEN_TYPE.leftBrace ||
	token.type === TOKEN_TYPE.leftParenthesis ||
	token.type === TOKEN_TYPE.minus ||
	token.type === TOKEN_TYPE.bang ||
	token.type === TOKEN_TYPE.plusPlus ||
	token.type === TOKEN_TYPE.minusMinus ||
	(token.type === TOKEN_TYPE.keyword &&
		(isLiteralKeyword(token) ||
			token.value === "async" ||
			token.value === AWAIT_KEYWORD));

export const formatToken = (token) => {
	return token.type in TOKEN_LABELS
		? TOKEN_LABELS[token.type]
		: token.value !== null
			? `${token.type} "${token.value}"`
			: token.type;
};

export const isNameToken = (token) => {
	return (
		token.type === TOKEN_TYPE.identifier ||
		(token.type === TOKEN_TYPE.keyword && !LITERAL_KEYWORDS.has(token.value))
	);
};

export const isObjectKeyToken = (token) => {
	return (
		token.type === TOKEN_TYPE.identifier || token.type === TOKEN_TYPE.keyword
	);
};
