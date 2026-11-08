import { parse, shared, tokenize } from "embedito95-core";

// Describes the generated async module as an import overlay for the main
// program, keyed by the intermediate's relative import source.
export const buildAsyncModuleOverlay = (asyncTaskModule) => {
	if (!asyncTaskModule) {
		return null;
	}
	const source = shared.ASYNC_INTERMEDIATE_IMPORT_SOURCE;
	const { moduleInfo, namespace } = asyncTaskModule;
	return {
		knownLibraries: new Set([source]),
		libraryExports: { [source]: moduleInfo.exports },
		libraryFunctions: { [source]: moduleInfo.functions },
		libraryTypes: { [source]: moduleInfo.types },
		libraryEnumInfo: { [source]: moduleInfo.enumInfo },
		libraryObjectTypes: { [source]: moduleInfo.objectTypes },
		libraryNamespaces: { [source]: namespace },
	};
};

// The program to compile: the async intermediate when async/await was detected,
// otherwise the original entry.
export const resolveMainIntermediate = (intermediate, ast, sourceLines) => {
	if (!intermediate.async) {
		return { ast, sourceLines };
	}
	return {
		ast: parse(tokenize(intermediate.main).tokens).ast,
		sourceLines: intermediate.main.split("\n"),
	};
};
