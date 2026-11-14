import { profile } from "./profile.js";

export const renderProjectInclude = ({ directory, headerFileName }) => {
	return `#include "libraries/${directory}/${headerFileName}"`;
};

export const renderModuleInclude = ({ directory, headerFileName }) => {
	return `#include "modules/${directory}/${headerFileName}"`;
};

export const renderDependencyInclude = ({ headerFileName }) => {
	return `#include "${headerFileName}"`;
};

export const generate = ({
	ast,
	sourceLines,
	platform,
	shared,
	libraryModules = {},
	libraryFunctions = {},
	libraryEnumInfo = {},
	libraryObjectTypes = {},
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
		libraryObjectInfo,
		mainGenerator: shared.resolveMainEntryGenerator(profile.mainEntry),
		renderStringLiteral,
		flashStrings: { progmem: false },
		additionalParts,
		additionalUserObjectMethods,
		libraryParts,
		moduleParts,
		libraryNamespaces,
		cycles,
	});
};
