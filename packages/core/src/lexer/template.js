import {
	ERROR_CODE,
	QUOTE_DOUBLE,
	QUOTE_SINGLE,
	TOKEN_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { advanceCharacter } from "./scanners.js";

const createTemplateContext = (source, position, line, column) => {
	return {
		source,
		position,
		line,
		column,
		raw: "",
		quasis: [],
		expressions: [],
		text: "",
		depth: 0,
		expressionSource: "",
		expressionLine: 0,
		expressionColumn: 0,
	};
};

const consumeTemplateChar = (context) => {
	const character = context.source[context.position];
	context.raw += character;
	const advanced = advanceCharacter(
		context.source,
		context.position,
		context.line,
		context.column,
	);
	context.position = advanced.position;
	context.line = advanced.line;
	context.column = advanced.column;
	return character;
};

const consumeTemplateQuotedString = (context) => {
	const quote = context.source[context.position];
	context.expressionSource += consumeTemplateChar(context);
	while (
		context.position < context.source.length &&
		context.source[context.position] !== quote
	) {
		if (context.source[context.position] === "\\") {
			context.expressionSource += consumeTemplateChar(context);
		}
		context.expressionSource += consumeTemplateChar(context);
	}
	if (context.position < context.source.length) {
		context.expressionSource += consumeTemplateChar(context);
	}
};

const handleTemplateText = (context, character) => {
	if (character === "`") {
		consumeTemplateChar(context);
		context.quasis.push(context.text);
		return { done: true };
	}
	if (character === "$" && context.source[context.position + 1] === "{") {
		consumeTemplateChar(context);
		consumeTemplateChar(context);
		context.quasis.push(context.text);
		context.text = "";
		context.depth = 1;
		context.expressionSource = "";
		context.expressionLine = context.line;
		context.expressionColumn = context.column;
		return { done: false };
	}
	context.text += consumeTemplateChar(context);
	return { done: false };
};

const handleTemplateExpression = (context, character) => {
	if (character === "`") {
		const nested = scanTemplate(
			context.source,
			context.position,
			context.line,
			context.column,
		);
		if (!nested) {
			return { done: true, error: true };
		}
		context.expressionSource += nested.raw;
		context.raw += nested.raw;
		context.position = nested.position;
		context.line = nested.line;
		context.column = nested.column;
		return { done: false };
	}
	if (character === QUOTE_SINGLE || character === QUOTE_DOUBLE) {
		consumeTemplateQuotedString(context);
		return { done: false };
	}
	if (character === "{") {
		context.depth++;
		context.expressionSource += consumeTemplateChar(context);
		return { done: false };
	}
	if (character === "}") {
		context.depth--;
		if (context.depth === 0) {
			consumeTemplateChar(context);
			context.expressions.push({
				source: context.expressionSource,
				line: context.expressionLine,
				column: context.expressionColumn,
			});
			return { done: false };
		}
		context.expressionSource += consumeTemplateChar(context);
		return { done: false };
	}
	context.expressionSource += consumeTemplateChar(context);
	return { done: false };
};

const scanTemplate = (source, position, line, column) => {
	const context = createTemplateContext(source, position, line, column);
	consumeTemplateChar(context);

	while (context.position < source.length) {
		const character = source[context.position];
		const result =
			context.depth === 0
				? handleTemplateText(context, character)
				: handleTemplateExpression(context, character);
		if (result.error) {
			return null;
		}
		if (result.done) {
			return {
				quasis: context.quasis,
				expressions: context.expressions,
				raw: context.raw,
				position: context.position,
				line: context.line,
				column: context.column,
			};
		}
	}

	return null;
};

export const scanTemplateToken = (
	source,
	position,
	line,
	column,
	errors,
	tokens,
) => {
	const startLine = line;
	const startColumn = column;
	const result = scanTemplate(source, position, line, column);
	if (!result) {
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unexpectedEof,
				location: {
					start: { line: startLine, column: startColumn },
					end: { line, column },
				},
			}),
		);
		return { position, line, column, stop: true };
	}
	tokens.push({
		type: TOKEN_TYPE.template,
		value: result.raw.slice(1, -1),
		quasis: result.quasis,
		expressions: result.expressions,
		line: startLine,
		column: startColumn,
	});
	return {
		position: result.position,
		line: result.line,
		column: result.column,
		stop: false,
	};
};
