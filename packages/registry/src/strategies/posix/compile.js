import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
} from "../shared/directories.js";
import {
	resolveArtifactsDirectory,
	resolveExecutablePath,
} from "./artifacts.js";
import { CLANG_NOT_FOUND_MESSAGE, findClangCompiler } from "./clang.js";

const COMPILE_TIMEOUT_MILLISECONDS = 120000;
const CXX_SOURCE_EXTENSION = ".cpp";
const CXX_STANDARD_FLAG = "-std=c++11";
const OPTIMIZATION_FLAG = "-O2";
const WARNING_FLAGS = ["-Wall", "-Wextra"];
const NO_EXCEPTIONS_FLAG = "-fno-exceptions";
const NO_RTTI_FLAG = "-fno-rtti";
const INCLUDE_DIRECTORY_FLAG = "-I";
const OUTPUT_FLAG = "-o";
const COMPILER_BASE_ARGUMENTS = [
	CXX_STANDARD_FLAG,
	OPTIMIZATION_FLAG,
	...WARNING_FLAGS,
	NO_EXCEPTIONS_FLAG,
	NO_RTTI_FLAG,
];
const LIBRARY_DIRECTORY_NAMES = new Set([
	LIBRARIES_DIRECTORY_NAME,
	CORE_LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
]);

const collectSourceFiles = ({ outputDirectory }) => {
	const sourceFiles = [];
	const includeDirectories = [outputDirectory];

	for (const entry of readdirSync(outputDirectory, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(CXX_SOURCE_EXTENSION)) {
			sourceFiles.push(join(outputDirectory, entry.name));
			continue;
		}
		if (!entry.isDirectory() || !LIBRARY_DIRECTORY_NAMES.has(entry.name)) {
			continue;
		}

		const librariesDirectory = join(outputDirectory, entry.name);
		for (const libraryName of readdirSync(librariesDirectory)) {
			const libraryDirectory = join(librariesDirectory, libraryName);
			// Headers reference their siblings with bare file names (e.g.
			// `core_console.h` includes `core_string.h`), so every library
			// directory must be an include root.
			includeDirectories.push(libraryDirectory);
			for (const fileName of readdirSync(libraryDirectory)) {
				if (fileName.endsWith(CXX_SOURCE_EXTENSION)) {
					sourceFiles.push(join(libraryDirectory, fileName));
				}
			}
		}
	}

	return { sourceFiles, includeDirectories };
};

const buildCompilerArguments = ({
	includeDirectories,
	sourceFiles,
	executablePath,
	cyclesDefineArgument,
}) => {
	const includeArguments = includeDirectories.flatMap((directory) => {
		return [INCLUDE_DIRECTORY_FLAG, directory];
	});

	return [
		...COMPILER_BASE_ARGUMENTS,
		cyclesDefineArgument,
		...includeArguments,
		...sourceFiles,
		OUTPUT_FLAG,
		executablePath,
	];
};

export const compile = async ({
	outputDir,
	projectName,
	shared,
	cycles = true,
	spawnSync: runSpawnSync = spawnSync,
	log = console.log,
}) => {
	const compilerPath = findClangCompiler({ spawnSync: runSpawnSync });

	if (!compilerPath) {
		throw new Error(CLANG_NOT_FOUND_MESSAGE);
	}

	const { sourceFiles, includeDirectories } = collectSourceFiles({
		outputDirectory: outputDir,
	});
	const artifactsDirectory = resolveArtifactsDirectory({ outputDir });
	const executablePath = resolveExecutablePath({ outputDir, projectName });

	mkdirSync(artifactsDirectory, { recursive: true });

	const compileResult = await shared.runSpawnedProcess(
		compilerPath,
		buildCompilerArguments({
			includeDirectories,
			sourceFiles,
			executablePath,
			cyclesDefineArgument: shared.renderCyclesDefineArgument(cycles),
		}),
		{ timeout: COMPILE_TIMEOUT_MILLISECONDS },
	);

	if (compileResult.code !== 0) {
		const stderr = compileResult.stderr.trim();
		throw new Error(
			stderr ? `Compilation failed:\n${stderr}` : "Compilation failed",
		);
	}

	log("\x1b[32m✔\x1b[39m Compiled");
};
