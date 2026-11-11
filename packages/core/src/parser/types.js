import { TOKEN_TYPE } from "../constants.js";
import { parseExpression } from "./expressions.js";
import { parseIdentifier } from "./imports.js";
import { extendLocation, makeLocation } from "./location.js";
import {
	consume,
	expectRequiredOrEof,
	peek,
	reportUnexpectedToken,
} from "./token-stream.js";

const TYPE_LIST_SEPARATOR = ", ";
const MISSING_TYPE_TEXT = "";
const PARAMETER_EXPECTED = "parameter";
const TYPE_ANNOTATION_EXPECTED = "type annotation";
const RETURN_TYPE_EXPECTED = "return type";

export const toTypeAnnotation = (parsedType) => {
	if (!parsedType) {
		return null;
	}
	const singleMember =
		parsedType.memberNodes?.length === 1 ? parsedType.memberNodes[0] : null;
	return {
		type: parsedType.name,
		loc: parsedType.loc,
		members: parsedType.memberNodes,
		typeArguments: singleMember?.typeArguments ?? null,
	};
};

const formatFunctionTypeParameter = (parameter) => {
	if (!parameter.type) {
		return parameter.name;
	}
	return `${parameter.name}: ${parameter.type}`;
};

const formatFunctionType = (signature) => {
	const parameters = signature.params
		.map((parameter) => {
			return formatFunctionTypeParameter(parameter);
		})
		.join(TYPE_LIST_SEPARATOR);
	return `(${parameters}) => ${signature.returnType ?? MISSING_TYPE_TEXT}`;
};

export const toSignatureParameter = (parameter) => {
	return {
		name: parameter.name,
		type: parameter.typeAnnotation?.type ?? null,
		typeAnnotation: parameter.typeAnnotation,
	};
};

const parseFunctionTypeParameter = (context) => {
	const parameter = parseParameter(context);
	if (!parameter.typeAnnotation) {
		reportUnexpectedToken(context, TYPE_ANNOTATION_EXPECTED, peek(context));
	}
	return toSignatureParameter(parameter);
};

const parseFunctionTypeSignature = (context) => {
	const params = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightParenthesis &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		if (peek(context).type === TOKEN_TYPE.comma) {
			reportUnexpectedToken(context, PARAMETER_EXPECTED, peek(context));
			consume(context);
			continue;
		}
		params.push(parseFunctionTypeParameter(context));
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
			continue;
		}
		break;
	}
	expectRequiredOrEof(context, TOKEN_TYPE.rightParenthesis);
	expectRequiredOrEof(context, TOKEN_TYPE.arrow);
	const parsedReturnType = parseTypeUnion(context);
	if (!parsedReturnType) {
		reportUnexpectedToken(context, RETURN_TYPE_EXPECTED, peek(context));
	}
	return {
		params,
		returnType: parsedReturnType?.name ?? null,
		returnTypeAnnotation: toTypeAnnotation(parsedReturnType),
	};
};

const makeFunctionTypeAnnotation = (signature, startToken, lastToken) => {
	return {
		type: formatFunctionType(signature),
		loc: makeLocation(startToken, extendLocation(lastToken ?? startToken)),
		members: [],
		typeArguments: null,
		functionType: signature,
	};
};

export const parseTypeAnnotation = (context) => {
	if (peek(context).type !== TOKEN_TYPE.leftParenthesis) {
		return toTypeAnnotation(parseTypeUnion(context));
	}
	const startToken = consume(context);
	const signature = parseFunctionTypeSignature(context);
	const lastToken = context.tokens[context.position - 1] ?? startToken;
	return makeFunctionTypeAnnotation(signature, startToken, lastToken);
};

const parseTypeArgument = (context) => {
	const parsed = parseTypeUnion(context);
	if (!parsed) {
		return null;
	}
	const member = parsed.memberNodes[0] ?? null;
	return {
		name: parsed.name,
		loc: parsed.loc,
		typeArguments:
			parsed.memberNodes.length === 1 ? (member?.typeArguments ?? null) : null,
	};
};

const parseTypeArguments = (context) => {
	consume(context);
	const typeArguments = [];
	while (
		peek(context).type !== TOKEN_TYPE.greaterThan &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		const argument = parseTypeArgument(context);
		if (!argument) {
			break;
		}
		typeArguments.push(argument);
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
			continue;
		}
		break;
	}
	expectRequiredOrEof(context, TOKEN_TYPE.greaterThan);
	return typeArguments;
};

const formatTypeArguments = (typeArguments) => {
	return `<${typeArguments
		.map((typeArgument) => {
			return typeArgument.name;
		})
		.join(", ")}>`;
};

export const parseTypeName = (context, token, options = {}) => {
	const { allowTypeArguments = true } = options;
	let name = token.value;
	const loc = makeLocation(token, extendLocation(token));
	while (peek(context).type === TOKEN_TYPE.dot) {
		consume(context);
		const next = expectRequiredOrEof(context, TOKEN_TYPE.identifier);
		if (!next) break;
		name += `.${next.value}`;
		loc.end = { line: next.line, column: next.column + next.value.length };
	}
	let typeArguments = null;
	if (allowTypeArguments && peek(context).type === TOKEN_TYPE.lessThan) {
		const parsedTypeArguments = parseTypeArguments(context);
		if (parsedTypeArguments.length > 0) {
			typeArguments = parsedTypeArguments;
			name += formatTypeArguments(typeArguments);
			const lastArgument = typeArguments[typeArguments.length - 1];
			loc.end = lastArgument.loc.end;
		}
	}
	while (peek(context).type === TOKEN_TYPE.leftBracket) {
		consume(context);
		let capacity = "";
		if (peek(context).type === TOKEN_TYPE.number) {
			capacity = consume(context).value;
		}
		const close = expectRequiredOrEof(context, TOKEN_TYPE.rightBracket);
		name += `[${capacity}]`;
		if (close) {
			loc.end = { line: close.line, column: close.column + 1 };
		}
	}
	return { name, loc, typeArguments };
};

export const parseTypeReference = (context) => {
	const token = peek(context);

	if (token.type === TOKEN_TYPE.keyword && token.value === "null") {
		consume(context);
		return { name: "null", loc: makeLocation(token, extendLocation(token)) };
	}

	if (token.type !== TOKEN_TYPE.identifier) {
		return null;
	}

	const typeToken = consume(context);
	return parseTypeName(context, typeToken);
};

export const parseTypeUnion = (context) => {
	const firstType = parseTypeReference(context);

	if (!firstType) {
		return null;
	}

	const memberNodes = [
		{
			name: firstType.name,
			loc: firstType.loc,
			typeArguments: firstType.typeArguments ?? null,
		},
	];

	while (peek(context).type === TOKEN_TYPE.pipe) {
		consume(context);
		const nextType = parseTypeReference(context);
		if (nextType) {
			memberNodes.push({
				name: nextType.name,
				loc: nextType.loc,
				typeArguments: nextType.typeArguments ?? null,
			});
		}
	}

	const name = memberNodes.map((member) => member.name).join(" | ");
	const last = memberNodes[memberNodes.length - 1];
	return {
		name,
		memberNodes,
		loc: makeLocation(firstType.loc.start, last.loc.end),
	};
};

const parseParameterUnionAnnotation = (context) => {
	return toTypeAnnotation(parseTypeUnion(context));
};

export const parseParameter = (context) => {
	const identifier = parseIdentifier(context);
	if (peek(context).type !== TOKEN_TYPE.colon) {
		identifier.typeAnnotation = null;
	} else {
		consume(context);
		identifier.typeAnnotation =
			peek(context).type === TOKEN_TYPE.leftParenthesis
				? parseTypeAnnotation(context)
				: parseParameterUnionAnnotation(context);
	}
	identifier.defaultValue = null;
	if (peek(context).type === TOKEN_TYPE.equal) {
		consume(context);
		identifier.defaultValue = parseExpression(context);
	}
	return identifier;
};

const parseTypeParameter = (context) => {
	const nameToken = expectRequiredOrEof(context, TOKEN_TYPE.identifier);
	if (!nameToken) {
		return null;
	}
	let defaultType = null;
	if (peek(context).type === TOKEN_TYPE.equal) {
		consume(context);
		defaultType = parseTypeReference(context);
	}
	return {
		name: nameToken.value,
		defaultType,
		loc: makeLocation(
			nameToken,
			defaultType?.loc.end ?? extendLocation(nameToken),
		),
	};
};

export const parseTypeParameters = (context) => {
	consume(context);
	const typeParameters = [];
	while (
		peek(context).type !== TOKEN_TYPE.greaterThan &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		const typeParameter = parseTypeParameter(context);
		if (!typeParameter) {
			break;
		}
		typeParameters.push(typeParameter);
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
			continue;
		}
		break;
	}
	expectRequiredOrEof(context, TOKEN_TYPE.greaterThan);
	return typeParameters;
};
