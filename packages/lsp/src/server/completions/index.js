import {
	collectImportAliases,
	collectNullNarrowing,
	parse,
	tokenize,
} from "embedito95-core";
import { loadProjectLibraryExports } from "../shared/libraries.js";
import { buildProjectTypeInference } from "../shared/type-inference.js";
import { resolveDefaultCompletions } from "./default-completions.js";
import { KEYWORD_COMPLETIONS } from "./keyword-completions.js";
import {
	isUnresolvedDotContext,
	NOT_HANDLED,
	resolveCallArgumentCompletions,
	resolveDotMemberCompletions,
	resolveDotPartialCompletions,
	resolveImportExportsCompletions,
	resolveLibraryNameCompletions,
	resolveObjectLiteralMemberCompletions,
	resolveThisMemberCompletions,
	resolveTypeCompletions,
} from "./steps.js";

// While the user is still typing inside `${...}`, the lexer cannot close the
// template and drops the whole token, so the partial member access never
// reaches the AST. Closing the interpolation and the template at the cursor
// yields the same nodes the completed source would produce, and lets the
// existing receiver/completion steps work unchanged.
const TEMPLATE_INTERPOLATION_TAIL_PATTERN = /\$\{[^}]*$/;
const TEMPLATE_INTERPOLATION_CLOSERS = "}`";

const isCursorCovered = (tokens, position) => {
	const eof = tokens[tokens.length - 1];

	if (eof.line !== position.line + 1) {
		return eof.line > position.line + 1;
	}

	return eof.column >= position.character + 1;
};

const closeTemplateInterpolationAtCursor = (source, position) => {
	const lines = source.split("\n");
	const currentLine = lines[position.line] ?? "";
	const beforeCursor = currentLine.slice(0, position.character);

	if (!TEMPLATE_INTERPOLATION_TAIL_PATTERN.test(beforeCursor)) {
		return source;
	}

	const afterCursor = currentLine.slice(position.character);
	lines[position.line] =
		`${beforeCursor}${TEMPLATE_INTERPOLATION_CLOSERS}${afterCursor}`;

	return lines.join("\n");
};

const parseSyntaxTree = (source) => {
	const { tokens } = tokenize(source);
	return { tokens, syntaxTree: parse(tokens).ast };
};

const parseCompletionSource = (source, position) => {
	const { tokens, syntaxTree } = parseSyntaxTree(source);

	if (isCursorCovered(tokens, position)) {
		return syntaxTree;
	}

	const repairedSource = closeTemplateInterpolationAtCursor(source, position);

	if (repairedSource === source) {
		return syntaxTree;
	}

	return parseSyntaxTree(repairedSource).syntaxTree;
};

const buildCompletionContext = (requestParameters, document, platform) => {
	const source = document.getText();
	const currentLineText =
		source.split("\n")[requestParameters.position.line] ?? "";
	const allExports = loadProjectLibraryExports(document.uri);

	return {
		source,
		currentLineText,
		allExports,
		platform,
		position: requestParameters.position,
	};
};

const parseCompletionSyntax = (context) => {
	const syntaxTree = parseCompletionSource(context.source, context.position);
	const narrowingRegions = collectNullNarrowing(syntaxTree);
	const inference = buildProjectTypeInference({
		syntaxTree,
		allExports: context.allExports,
		importAliases: collectImportAliases(syntaxTree),
		platform: context.platform,
		narrowingRegions,
	});

	return {
		syntaxTree,
		narrowingRegions,
		beforeCursor: context.currentLineText.slice(0, context.position.character),
		wordSize: inference.wordSize,
		wordType: inference.wordType,
		resolveNameType: inference.resolveNameType,
		resolveCallType: inference.resolveCallType,
		objectTypes: inference.objectTypes,
	};
};

export const onCompletion = (requestParameters, documents, platform) => {
	const document = documents.get(requestParameters.textDocument.uri);

	if (!document) {
		return KEYWORD_COMPLETIONS;
	}

	const context = buildCompletionContext(requestParameters, document, platform);

	for (const step of [
		resolveImportExportsCompletions,
		resolveLibraryNameCompletions,
	]) {
		const completions = step(context);

		if (completions !== NOT_HANDLED) {
			return completions;
		}
	}

	Object.assign(context, parseCompletionSyntax(context));

	for (const step of [
		resolveObjectLiteralMemberCompletions,
		resolveTypeCompletions,
		resolveCallArgumentCompletions,
		resolveThisMemberCompletions,
		resolveDotMemberCompletions,
		resolveDotPartialCompletions,
	]) {
		const completions = step(context);

		if (completions !== NOT_HANDLED) {
			return completions;
		}
	}

	if (isUnresolvedDotContext(context)) {
		return [];
	}

	return resolveDefaultCompletions(context);
};
