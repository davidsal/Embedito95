import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { generateCode } from "./codegen.js";

const PROJECT_LIBRARY_INCLUDE_PATTERN = /^#include "libraries\/([^"]+)"$/;
const CORE_INCLUDE_PATTERN = /^#include "core\/([^"]+)"$/;

const rewriteLibraryHeaderInclude = (line) => {
	const projectLibrary = line.match(PROJECT_LIBRARY_INCLUDE_PATTERN);
	if (projectLibrary) {
		return `#include "../${projectLibrary[1]}"`;
	}
	const coreInclude = line.match(CORE_INCLUDE_PATTERN);
	if (coreInclude) {
		return `#include "../../core/${coreInclude[1]}"`;
	}
	return line;
};

export const compileProjectLibrary = ({
	source,
	sourceLines,
	platform,
	libraryModules = {},
	libraryFunctions = {},
	libraryEnumInfo = {},
	libraryObjectTypes = {},
	renderStringLiteral,
	flashStrings,
	additionalUserObjectMethods = null,
	libraryNamespaces = null,
	namespace,
	headerIncludes = null,
	libraryGlobalsInSource = false,
	cycles = true,
}) => {
	const { tokens, errors: lexErrors } = tokenize(source);

	if (lexErrors.length > 0) {
		return { main: "", userObjectMethods: new Map() };
	}

	const { ast } = parse(tokens);
	const {
		main,
		userObjectMethods,
		libraryHeaderGlobal,
		libraryHeaderNamespace,
		libraryHeaderTypeInfo,
		librarySource,
		objectTypeInfo,
	} = generateCode({
		ast,
		sourceLines,
		platform,
		libraryModules,
		libraryFunctions,
		libraryEnumInfo,
		libraryObjectTypes,
		mainGenerator: () => "",
		renderStringLiteral,
		flashStrings,
		additionalUserObjectMethods,
		libraryNamespaces,
		namespace,
		splitLibrary: true,
		libraryGlobalsInSource,
		cycles,
	});

	if (!namespace) {
		return { main, userObjectMethods };
	}

	const lines = main
		.split("\n")
		.filter((line) => !/^\s*#include\b/.test(line))
		.join("\n")
		.trim();

	if (!lines) {
		return { main: "", userObjectMethods };
	}
	const guardPrefix = `${namespace.toUpperCase()}_H`;
	const headerFileName = `${namespace}.h`;
	const headerGlobal = [...(headerIncludes ?? []), libraryHeaderGlobal]
		.filter(Boolean)
		.join("\n")
		.split("\n")
		.map(rewriteLibraryHeaderInclude)
		.join("\n");
	const headerSections = [`#ifndef ${guardPrefix}\n#define ${guardPrefix}`];
	if (headerGlobal) {
		headerSections.push(headerGlobal);
	}
	headerSections.push(`namespace ${namespace} {`);
	if (libraryHeaderNamespace) {
		headerSections.push(libraryHeaderNamespace);
	}
	headerSections.push("}");
	if (libraryHeaderTypeInfo) {
		headerSections.push(libraryHeaderTypeInfo);
	}
	headerSections.push("#endif");
	const header = headerSections.join("\n\n");
	const libraryCpp = [
		`#include "${headerFileName}"`,
		`namespace ${namespace} {`,
		librarySource,
		"}",
	]
		.filter(Boolean)
		.join("\n\n");

	return {
		main,
		header,
		source: libraryCpp,
		userObjectMethods,
		objectTypeInfo,
	};
};
