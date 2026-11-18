// Single source of truth for the project-wide compile-time switches.
//
// The switches live in a generated `e95_config.h` header, not in preprocessor
// arguments. Every translation unit that includes the runtime (`ref.h`) also
// sees the same `E95_CYCLES` value, so the inline functions in `ref.h` have one
// body across the project translation unit, copied core, libraries, modules and
// async units. Emitting the defines per translation unit or passing them as
// `-D` is not the product mechanism: the generated header is.
//
// `E95_FLOAT64_SOFTWARE` reports whether the target's `f64` is the portable
// `_e95_f64` type instead of a native `double` (see the platform's `float64`
// mode). Shared C++ that must pick between a native and a software double reads
// it from here, so a single platform field decides the implementation.
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
const FLOAT64_SOFTWARE_DEFINE_NAME = "E95_FLOAT64_SOFTWARE";
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

export const renderCyclesConfigHeader = (cycles, float64Software = false) => {
	const value = cycles ? 1 : 0;
	const float64SoftwareValue = float64Software ? 1 : 0;
	return [
		`#ifndef ${CONFIG_GUARD_NAME}`,
		`#define ${CONFIG_GUARD_NAME}`,
		"",
		`#define ${CYCLES_DEFINE_NAME} ${value}`,
		`#define ${FLOAT64_SOFTWARE_DEFINE_NAME} ${float64SoftwareValue}`,
		"",
		`#endif // ${CONFIG_GUARD_NAME}`,
		"",
	].join("\n");
};

export const writeCyclesConfigHeader = (
	directory,
	cycles,
	float64Software = false,
) => {
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, CYCLES_CONFIG_FILE_NAME),
		renderCyclesConfigHeader(cycles, float64Software),
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

export const writeCyclesConfigHeaders = (
	rootDirectory,
	cycles,
	float64Software = false,
) => {
	writeCyclesConfigHeader(rootDirectory, cycles, float64Software);
	for (const directoryName of CONFIG_DIRECTORY_NAMES) {
		const baseDirectory = join(rootDirectory, directoryName);
		for (const subdirectory of listSubdirectories(baseDirectory)) {
			writeCyclesConfigHeader(subdirectory, cycles, float64Software);
		}
	}
};

// Manual override for host probes and one-off measurements (`-DE95_CYCLES=0|1`
// on the command line). Product builds rely on the generated `e95_config.h`
// instead; do not thread this back into the platform compile strategies.
export const renderCyclesDefineArgument = (cycles) => {
	return `-D${CYCLES_DEFINE_NAME}=${cycles ? 1 : 0}`;
};
