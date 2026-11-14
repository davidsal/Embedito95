// Single source of truth for the refcount cycle collector switch.
//
// The switch lives in a generated `e95_config.h` header, not in a preprocessor
// argument. Every translation unit that includes the runtime (`ref.h`) also sees
// the same `E95_CYCLES` value, so the inline functions in `ref.h` have one body
// across the project translation unit, copied core, libraries, modules and async
// units. Emitting the define per translation unit or passing it as `-D` is not
// the product mechanism: the generated header is.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
	UTF8,
} from "../constants.js";

export const ENABLE_CYCLE_COLLECTOR_OPTION = "enableCycleCollector";
export const CYCLES_CONFIG_FILE_NAME = "e95_config.h";

const DEFAULT_ENABLE_CYCLE_COLLECTOR = true;
const CYCLES_DEFINE_NAME = "E95_CYCLES";
const CONFIG_GUARD_NAME = "E95_CONFIG_H";
const CONFIG_DIRECTORY_NAMES = [
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
];

export const resolveCyclesEnabled = (configuration) => {
	return (
		configuration[ENABLE_CYCLE_COLLECTOR_OPTION] ??
		DEFAULT_ENABLE_CYCLE_COLLECTOR
	);
};

export const renderCyclesConfigHeader = (cycles) => {
	const value = cycles ? 1 : 0;
	return [
		`#ifndef ${CONFIG_GUARD_NAME}`,
		`#define ${CONFIG_GUARD_NAME}`,
		"",
		`#define ${CYCLES_DEFINE_NAME} ${value}`,
		"",
		`#endif // ${CONFIG_GUARD_NAME}`,
		"",
	].join("\n");
};

export const writeCyclesConfigHeader = (directory, cycles) => {
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, CYCLES_CONFIG_FILE_NAME),
		renderCyclesConfigHeader(cycles),
		UTF8,
	);
};

const listSubdirectories = (directory) => {
	if (!existsSync(directory)) {
		return [];
	}
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => {
			return entry.isDirectory();
		})
		.map((entry) => {
			return join(directory, entry.name);
		});
};

export const writeCyclesConfigHeaders = (rootDirectory, cycles) => {
	writeCyclesConfigHeader(rootDirectory, cycles);
	for (const directoryName of CONFIG_DIRECTORY_NAMES) {
		const baseDirectory = join(rootDirectory, directoryName);
		for (const subdirectory of listSubdirectories(baseDirectory)) {
			writeCyclesConfigHeader(subdirectory, cycles);
		}
	}
};

// Manual override for host probes and one-off measurements (`-DE95_CYCLES=0|1`
// on the command line). Product builds rely on the generated `e95_config.h`
// instead; do not thread this back into the platform compile strategies.
export const renderCyclesDefineArgument = (cycles) => {
	return `-D${CYCLES_DEFINE_NAME}=${cycles ? 1 : 0}`;
};
