import { profile } from "./profile.js";

export const generate = ({
	ast,
	sourceLines,
	platform,
	shared,
	libraryModules = {},
	libraryFunctions = {},
	libraryEnumInfo = {},
	libraryObjectTypes = {},
	libraryTypes = {},
	libraryObjectInfo = null,
	additionalParts,
	additionalUserObjectMethods,
	libraryParts,
	moduleParts,
	libraryNamespaces,
	cycles = true,
}) => {
	const { renderStringLiteral } = shared.resolvePlatformRenderOptions(platform);
	return shared.generateCode({
		ast,
		sourceLines,
		platform,
		libraryModules,
		libraryFunctions,
		libraryEnumInfo,
		libraryObjectTypes,
		libraryTypes,
		libraryObjectInfo,
		mainGenerator: shared.resolveMainEntryGenerator(profile.mainEntry),
		renderStringLiteral,
		additionalParts,
		additionalUserObjectMethods,
		libraryParts,
		moduleParts,
		libraryNamespaces,
		cycles,
	});
};
