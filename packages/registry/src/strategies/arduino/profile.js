const MAIN_ENTRY_SETUP_LOOP = "setup/loop";

export const profile = {
	displayName: "Arduino",
	codegen: "arduino",
	extension: ".ino",
	enumStyle: "alias",
	mainEntry: MAIN_ENTRY_SETUP_LOOP,
	defaults: {
		sram: 2048,
	},
};

export const renderArtifactInclude = (libraryName) => {
	return `#include <core_${libraryName}.h>`;
};
