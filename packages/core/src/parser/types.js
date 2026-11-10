import { TOKEN_TYPE } from "../constants.js";
import { parseExpression } from "./expressions.js";
import { parseIdentifier } from "./imports.js";
import { extendLocation, makeLocation } from "./location.js";
import { consume, expectRequiredOrEof, peek } from "./token-stream.js";

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

export const parseParameter = (context) => {
	const identifier = parseIdentifier(context);
	if (peek(context).type === TOKEN_TYPE.colon) {
		consume(context);
		const memberNodes = [];
		const firstType = parseTypeReference(context);
		const locationStart = peek(context);
		let lastToken = peek(context);
		if (firstType) {
			memberNodes.push({
				name: firstType.name,
				loc: firstType.loc,
				typeArguments: firstType.typeArguments ?? null,
			});
			lastToken = {
				line: firstType.loc.end.line,
				column: firstType.loc.end.column,
			};
		}
		while (peek(context).type === TOKEN_TYPE.pipe) {
			consume(context);
			const nextType = parseTypeReference(context);
			if (nextType) {
				memberNodes.push({
					name: nextType.name,
					loc: nextType.loc,
					typeArguments: nextType.typeArguments ?? null,
				});
				lastToken = {
					line: nextType.loc.end.line,
					column: nextType.loc.end.column,
				};
			}
		}
		const typeString = memberNodes.map((member) => member.name).join(" | ");
		const singleMember = memberNodes.length === 1 ? memberNodes[0] : null;
		identifier.typeAnnotation =
			memberNodes.length > 0
				? {
						type: typeString,
						loc: makeLocation(locationStart, extendLocation(lastToken)),
						members: memberNodes,
						typeArguments: singleMember?.typeArguments ?? null,
					}
				: null;
	} else {
		identifier.typeAnnotation = null;
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
