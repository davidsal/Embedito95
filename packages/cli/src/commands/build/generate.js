import { DEFAULT_WORD_SIZE, shared } from "embedito95-core";
import { compileProjectLibraries } from "./compileProjectLibraries.js";
import { compileProjectModules } from "./compileProjectModules.js";

export const generateProjectCode = async (
	ast,
	sourceLines,
	strategy,
	platform,
	projectLibraries,
	usedLibraries,
	localModules,
	libraryModules,
	entryLibraries,
	asyncModuleIncludes,
	asyncObjectTypeInfo = null,
	cycles = true,
) => {
	const {
		projectLibraryParts,
		projectLibraryIncludes,
		projectLibraryFiles,
		additionalUserObjectMethods,
		libraryObjectInfo,
	} = compileProjectLibraries(
		usedLibraries,
		strategy,
		platform,
		projectLibraries,
		libraryModules,
		DEFAULT_WORD_SIZE,
		cycles,
	);

	// The generated async module is compiled on its own (not through the project
	// library pipeline), so its per-type handle info must be merged in by hand:
	// the entry unit references `_AsyncHandlers` as an imported type and needs to
	// know the module lowered it to a shared `Object<T>` handle.
	const mergedLibraryObjectInfo = new Map([
		...(libraryObjectInfo ?? []),
		...(asyncObjectTypeInfo ?? []),
	]);

	const { moduleIncludes, moduleFiles } = compileProjectModules(
		localModules,
		strategy,
		platform,
		projectLibraries,
		libraryModules,
		DEFAULT_WORD_SIZE,
		projectLibraryFiles,
		cycles,
	);

	const generated =
		strategy.generate({
			ast,
			sourceLines,
			platform,
			shared,
			libraryModules,
			libraryFunctions: entryLibraries.libraryFunctions,
			libraryEnumInfo: entryLibraries.libraryEnumInfo,
			libraryObjectTypes: entryLibraries.libraryObjectTypes,
			libraryTypes: entryLibraries.libraryTypes,
			libraryNamespaces: entryLibraries.libraryNamespaces,
			libraryParts: [...projectLibraryIncludes, ...projectLibraryParts],
			moduleParts: [...moduleIncludes, ...(asyncModuleIncludes ?? [])],
			additionalUserObjectMethods,
			libraryObjectInfo: mergedLibraryObjectInfo,
			cycles,
		}) ?? {};

	return { generated, projectLibraryFiles, moduleFiles };
};
