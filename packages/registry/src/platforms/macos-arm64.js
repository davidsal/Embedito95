import {
	ASYNC_MODE,
	CONSOLE_OUTPUT,
	DEFAULT_TYPES,
	FLOAT64_MODE,
	INT128_MODE,
	PLATFORM_CATEGORY,
} from "./enums.js";

const HOST_CORE_LIBRARIES = ["type", "console", "time", "async"];

export const platform = {
	name: "macos-arm64",
	package: "@embedito95/macos-arm64",
	version: "0.1.0",
	strategy: "posix",
	displayName: "macOS - ARM64",
	category: PLATFORM_CATEGORY.HOST,
	order: 10,
	coreLibraries: HOST_CORE_LIBRARIES,
	types: DEFAULT_TYPES,
	float64: FLOAT64_MODE.NATIVE,
	int128: INT128_MODE.NATIVE,
	console: CONSOLE_OUTPUT.STDOUT,
	async: ASYNC_MODE.SCHEDULER,
	specs: {
		architecture: "ARM64",
		progmem: false,
		wordSize: 64,
	},
};
