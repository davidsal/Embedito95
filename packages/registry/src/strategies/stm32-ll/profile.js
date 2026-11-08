const MAIN_ENTRY_MAIN = "int main";

export const profile = {
	displayName: "STM32",
	codegen: "stm32-ll",
	extension: ".cpp",
	enumStyle: "enum",
	mainEntry: MAIN_ENTRY_MAIN,
	defaults: {
		frequency: 72000000,
		crystal: 8000000,
		sram: 20480,
	},
};

export const renderArtifactInclude = (libraryName) => {
	return `#include "core/${libraryName}/core_${libraryName}.h"`;
};
