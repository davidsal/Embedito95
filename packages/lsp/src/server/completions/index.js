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
	const { tokens } = tokenize(context.source);
	const { ast: syntaxTree } = parse(tokens);
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

	return resolveDefaultCompletions(context);
};
