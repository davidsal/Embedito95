const HOST_DISPLAY_NAME = "POSIX host";
const MAIN_ENTRY_MAIN = "int main";
const CODEGEN_NAME = "posix";
const SOURCE_EXTENSION = ".cpp";

export const profile = {
	displayName: HOST_DISPLAY_NAME,
	codegen: CODEGEN_NAME,
	extension: SOURCE_EXTENSION,
	enumStyle: "enum",
	mainEntry: MAIN_ENTRY_MAIN,
};

export const renderArtifactInclude = (libraryName) => {
	return `#include "core/${libraryName}/core_${libraryName}.h"`;
};
