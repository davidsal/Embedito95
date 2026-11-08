import { AST_NODE, ERROR_CODE, TOKEN_TYPE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { parseExpression } from "./expressions.js";
import { parseIdentifier } from "./imports.js";
import { extendLocation, makeLocation, makeTokenRange } from "./location.js";
import {
	acceptSemicolon,
	consume,
	expectRequired,
	peek,
	reportParserError,
	reportUnexpectedToken,
} from "./token-stream.js";
import { formatToken, isExpressionStart, isNameToken } from "./tokens.js";
import { parseParameter, parseTypeUnion } from "./types.js";

const isNullOnlyTypeAnnotation = (context) => {
	const firstToken = context.tokens[context.position];
	return (
		firstToken?.type === TOKEN_TYPE.keyword &&
		firstToken.value === "null" &&
		context.tokens[context.position + 1]?.type !== TOKEN_TYPE.pipe
	);
};

const parseVariableDeclarator = (context) => {
	const identifier = parseIdentifier(context);
	if (peek(context).type === TOKEN_TYPE.colon) {
		consume(context);
		if (!isNullOnlyTypeAnnotation(context)) {
			const parsed = parseTypeUnion(context);
			if (parsed) {
				identifier.typeAnnotation = toTypeAnnotation(parsed);
			}
		}
	}
	const equalsToken = peek(context);
	if (equalsToken.type === TOKEN_TYPE.equal) {
		consume(context);
		const nextToken = peek(context);
		if (!isExpressionStart(nextToken)) {
			if (nextToken.type === TOKEN_TYPE.eof) {
				reportUnexpectedToken(context, "(), async () or expression", nextToken);
			} else {
				reportParserError(
					context,
					makeDiagnostic({
						code: ERROR_CODE.unexpectedToken,
						params: {
							expected: "(), async () or expression",
							found: `'${nextToken.value ?? formatToken(nextToken)}'`,
						},
						location: makeTokenRange(nextToken),
					}),
				);
			}
			return {
				type: AST_NODE.variableDeclarator,
				id: identifier,
				init: null,
				loc: makeLocation(identifier, peek(context)),
			};
		}
		const initializer = parseExpression(context);
		return {
			type: AST_NODE.variableDeclarator,
			id: identifier,
			init: initializer,
			loc: makeLocation(identifier, peek(context)),
		};
	}
	return {
		type: AST_NODE.variableDeclarator,
		id: identifier,
		init: null,
		loc: makeLocation(identifier, peek(context)),
	};
};

export const parseVariableDeclaration = (context) => {
	const start = consume(context);
	const kind = start.value;
	if (peek(context).type !== TOKEN_TYPE.identifier) {
		reportUnexpectedToken(context, "identifier");
		return {
			type: AST_NODE.variableDeclaration,
			kind,
			declarations: [],
			loc: makeLocation(start, peek(context)),
		};
	}
	const declarator = parseVariableDeclarator(context);
	if (declarator.init === null) {
		const next = peek(context);
		const declaratorLine = declarator.id?.loc?.end?.line;
		if (
			declaratorLine &&
			next.type !== TOKEN_TYPE.eof &&
			next.type !== TOKEN_TYPE.semicolon &&
			next.type !== TOKEN_TYPE.rightBrace &&
			next.line === declaratorLine
		) {
			reportUnexpectedToken(context, "'=', ';' or newline", next);
		}
	}
	acceptSemicolon(context);
	const end = peek(context);
	return {
		type: AST_NODE.variableDeclaration,
		kind,
		declarations: [declarator],
		loc: makeLocation(start, end),
	};
};

export const parseEnumDeclaration = (context) => {
	const start = consume(context);
	const nameToken = expectRequired(context, TOKEN_TYPE.identifier);
	const name = nameToken?.value ?? "?";
	const nameIdent = {
		type: AST_NODE.identifier,
		name,
		loc: makeLocation(nameToken ?? start, extendLocation(nameToken ?? start)),
	};
	expectRequired(context, TOKEN_TYPE.leftBrace);
	const members = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightBrace &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		const memberToken =
			peek(context).type === TOKEN_TYPE.number
				? expectRequired(context, TOKEN_TYPE.number)
				: expectRequired(context, TOKEN_TYPE.identifier);
		if (!memberToken) {
			break;
		}
		let value = null;
		if (peek(context).type === TOKEN_TYPE.equal) {
			consume(context);
			value = parseExpression(context);
		}
		members.push({
			type: AST_NODE.identifier,
			name: memberToken.value,
			value,
			loc: makeLocation(memberToken, extendLocation(memberToken)),
		});
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
			if (peek(context).type === TOKEN_TYPE.rightBrace) {
				break;
			}
		} else {
			break;
		}
	}
	const closingBrace = expectRequired(context, TOKEN_TYPE.rightBrace);
	return {
		type: AST_NODE.enumDeclaration,
		name,
		nameIdent,
		members,
		loc: makeLocation(start, closingBrace ?? peek(context)),
	};
};

const toTypeAnnotation = (parsedType) => {
	if (!parsedType) {
		return null;
	}
	return {
		type: parsedType.name,
		loc: parsedType.loc,
		members: parsedType.memberNodes,
	};
};

const parseTypeMethodSignature = (context) => {
	const params = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightParenthesis &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		const param = parseParameter(context);
		params.push({
			name: param.name,
			type: param.typeAnnotation?.type ?? null,
			typeAnnotation: param.typeAnnotation,
		});
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
		}
	}
	expectRequired(context, TOKEN_TYPE.rightParenthesis);
	expectRequired(context, TOKEN_TYPE.arrow);
	const parsedReturnType = parseTypeUnion(context);
	return {
		params,
		returnType: parsedReturnType?.name ?? null,
		returnTypeAnnotation: toTypeAnnotation(parsedReturnType),
	};
};

const parseTypeMember = (context) => {
	const memberToken = isNameToken(peek(context))
		? consume(context)
		: expectRequired(context, TOKEN_TYPE.identifier);
	if (!memberToken) {
		return null;
	}
	const memberName = memberToken.value;
	const memberStart = memberToken;
	let optional = false;
	if (peek(context).type === TOKEN_TYPE.question) {
		optional = true;
		consume(context);
	}
	expectRequired(context, TOKEN_TYPE.colon);
	let isMethod = false;
	let params = [];
	let returnType = null;
	let returnTypeAnnotation = null;
	if (peek(context).type === TOKEN_TYPE.leftParenthesis) {
		isMethod = true;
		consume(context);
		const signature = parseTypeMethodSignature(context);
		params = signature.params;
		returnType = signature.returnType;
		returnTypeAnnotation = signature.returnTypeAnnotation;
	} else {
		const parsedReturnType = parseTypeUnion(context);
		if (parsedReturnType) {
			returnType = parsedReturnType.name;
			returnTypeAnnotation = toTypeAnnotation(parsedReturnType);
		}
	}
	return {
		kind: isMethod ? "method" : "field",
		name: memberName,
		params,
		returnType,
		returnTypeAnnotation,
		optional,
		loc: makeLocation(
			memberStart,
			extendLocation(context.tokens[context.position - 1] ?? memberToken),
		),
	};
};

const isTypeMemberSeparator = (token) => {
	return token.type === TOKEN_TYPE.comma || token.type === TOKEN_TYPE.semicolon;
};

const collectTypeMembers = (context) => {
	const members = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightBrace &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		if (isTypeMemberSeparator(peek(context))) {
			consume(context);
			continue;
		}
		const member = parseTypeMember(context);
		if (!member) {
			break;
		}
		members.push(member);
		if (isTypeMemberSeparator(peek(context))) {
			consume(context);
		}
	}
	return members;
};

export const parseTypeDeclaration = (context) => {
	const start = consume(context);
	const nameToken = expectRequired(context, TOKEN_TYPE.identifier);
	const name = nameToken?.value ?? "?";
	const nameIdent = {
		type: AST_NODE.identifier,
		name,
		loc: makeLocation(nameToken ?? start, extendLocation(nameToken ?? start)),
	};
	expectRequired(context, TOKEN_TYPE.equal);
	expectRequired(context, TOKEN_TYPE.leftBrace);
	const members = collectTypeMembers(context);
	const closingBrace = expectRequired(context, TOKEN_TYPE.rightBrace);
	return {
		type: AST_NODE.typeDeclaration,
		name,
		nameIdent,
		members,
		loc: makeLocation(start, closingBrace ?? peek(context)),
	};
};
