import { TOKEN_TYPE } from "../constants.js";
import { parseExpression } from "./expressions.js";
import { parseIdentifier } from "./imports.js";
import { extendLocation, makeLocation } from "./location.js";
import { consume, expectRequiredOrEof, peek } from "./token-stream.js";

export const parseTypeName = (context, token) => {
	let name = token.value;
	const loc = makeLocation(token, extendLocation(token));
	while (peek(context).type === TOKEN_TYPE.dot) {
		consume(context);
		const next = expectRequiredOrEof(context, TOKEN_TYPE.identifier);
		if (!next) break;
		name += `.${next.value}`;
		loc.end = { line: next.line, column: next.column + next.value.length };
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
	return { name, loc };
};

const parseTypeReference = (context) => {
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

	const memberNodes = [{ name: firstType.name, loc: firstType.loc }];

	while (peek(context).type === TOKEN_TYPE.pipe) {
		consume(context);
		const nextType = parseTypeReference(context);
		if (nextType) {
			memberNodes.push({ name: nextType.name, loc: nextType.loc });
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
			memberNodes.push({ name: firstType.name, loc: firstType.loc });
			lastToken = {
				line: firstType.loc.end.line,
				column: firstType.loc.end.column,
			};
		}
		while (peek(context).type === TOKEN_TYPE.pipe) {
			consume(context);
			const nextType = parseTypeReference(context);
			if (nextType) {
				memberNodes.push({ name: nextType.name, loc: nextType.loc });
				lastToken = {
					line: nextType.loc.end.line,
					column: nextType.loc.end.column,
				};
			}
		}
		const typeString = memberNodes.map((member) => member.name).join(" | ");
		identifier.typeAnnotation =
			memberNodes.length > 0
				? {
						type: typeString,
						loc: makeLocation(locationStart, extendLocation(lastToken)),
						members: memberNodes,
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
