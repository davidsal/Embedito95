import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";

const writeSourceFiles = (files, baseDirectory) => {
	for (const file of files) {
		const targetDirectory = join(baseDirectory, file.directory);
		mkdirSync(targetDirectory, { recursive: true });
		writeFileSync(
			join(targetDirectory, file.headerFileName),
			file.header,
			UTF8,
		);
		writeFileSync(
			join(targetDirectory, file.sourceFileName),
			file.source,
			UTF8,
		);
	}
};

export const writeProjectFiles = (projectLibraryFiles, buildDirectory) => {
	writeSourceFiles(
		projectLibraryFiles,
		join(buildDirectory, LIBRARIES_DIRECTORY_NAME),
	);
};

export const writeModuleFiles = (moduleFiles, buildDirectory) => {
	writeSourceFiles(moduleFiles, join(buildDirectory, MODULES_DIRECTORY_NAME));
};

export const copyCoreLibraries = (
	libraryModules,
	buildDirectory,
	workingDirectory,
) => {
	for (const libraryName of Object.keys(libraryModules)) {
		const libraryBuildDirectory = join(
			workingDirectory,
			CORE_LIBRARIES_DIRECTORY_NAME,
			libraryName,
			BUILD_DIRECTORY_NAME,
		);
		if (!existsSync(libraryBuildDirectory)) {
			continue;
		}
		cpSync(
			libraryBuildDirectory,
			join(buildDirectory, CORE_LIBRARIES_DIRECTORY_NAME, libraryName),
			{ recursive: true },
		);
	}
};
