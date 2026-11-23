// T-046: the host codegen suites (`test:run` and `test:leak`) must provision
// their project from tracked registry sources in a temporary directory, never
// from the gitignored `packages/test/testers/` tree. A clean clone has no
// `testers/arduino-nano`, so the old copy-based setup failed with ENOENT. These
// checks pin the hermetic contract: temp location, registry provenance,
// generated project structure and a real build on top of it.
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import {
	CODEGEN_HERMETIC_TEMP_DIRECTORY_PREFIX,
	REGISTRY_LIBRARIES_DIRECTORY,
} from "./constants.js";
import { buildEntry, createProject } from "./project-setup.js";
import { expectEqual } from "./reporting.js";
import { TESTER_PLATFORM_NAME, TESTERS_DIRECTORY } from "./runner-harness.js";

const ENTRY_FILE_NAME = "main.e95";
const TRANSLATION_UNIT_EXTENSION = ".ino";
const BUILD_PROJECT_DIRECTORY_NAME = "hermetic-build-project";
const FIRST_CORE_LIBRARY_NAME = "gpio";
const FIRST_CLIENT_LIBRARY_NAME = "dht22";
const TRIVIAL_ENTRY_SOURCE = `const setup = () => {}

const main = () => {
	setup()
}

main()
`;

const listDirectoryNames = (directory) => {
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => {
			return entry.isDirectory();
		})
		.map((entry) => {
			return entry.name;
		});
};

const listRegistryCoreLibraryNames = () => {
	return listDirectoryNames(REGISTRY_LIBRARIES_DIRECTORY).filter(
		(libraryName) => {
			return existsSync(
				join(REGISTRY_LIBRARIES_DIRECTORY, libraryName, CONFIG_FILE),
			);
		},
	);
};

const checkTemplateLocation = (rootDirectory, templateDirectory) => {
	return [
		expectEqual(
			"hermetic project is provisioned under the temporary root",
			templateDirectory.startsWith(rootDirectory),
			true,
		),
		expectEqual(
			"hermetic project is provisioned under the system temp directory",
			templateDirectory.startsWith(tmpdir()),
			true,
		),
		expectEqual(
			"hermetic project is not provisioned inside packages/test/testers",
			templateDirectory.startsWith(TESTERS_DIRECTORY),
			false,
		),
	];
};

const checkTemplateStructure = (templateDirectory) => {
	const configuration = JSON.parse(
		readFileSync(join(templateDirectory, CONFIG_FILE), UTF8),
	);
	const coreLibraryNames = listDirectoryNames(
		join(templateDirectory, CORE_LIBRARIES_DIRECTORY_NAME),
	);
	const clientLibraryNames = listDirectoryNames(
		join(templateDirectory, LIBRARIES_DIRECTORY_NAME),
	);
	const registryCoreLibraryNames = listRegistryCoreLibraryNames();

	return [
		expectEqual(
			"hermetic project contains config.json",
			existsSync(join(templateDirectory, CONFIG_FILE)),
			true,
		),
		expectEqual(
			"hermetic project contains core/",
			existsSync(join(templateDirectory, CORE_LIBRARIES_DIRECTORY_NAME)),
			true,
		),
		expectEqual(
			"hermetic project contains libraries/",
			existsSync(join(templateDirectory, LIBRARIES_DIRECTORY_NAME)),
			true,
		),
		expectEqual(
			"hermetic config targets the tester platform",
			configuration.platform,
			TESTER_PLATFORM_NAME,
		),
		expectEqual(
			"hermetic config lists the installed core packages",
			configuration.core.length > 0,
			true,
		),
		expectEqual(
			"hermetic project vendors the gpio core library",
			coreLibraryNames.includes(FIRST_CORE_LIBRARY_NAME),
			true,
		),
		expectEqual(
			"hermetic project vendors the dht22 client library",
			clientLibraryNames.includes(FIRST_CLIENT_LIBRARY_NAME),
			true,
		),
		expectEqual(
			"hermetic core libraries come from packages/registry/src/core",
			coreLibraryNames.every((libraryName) => {
				return registryCoreLibraryNames.includes(libraryName);
			}),
			true,
		),
	];
};

const captureBuildFailure = async (projectDirectory) => {
	try {
		await buildEntry(projectDirectory, TESTER_PLATFORM_NAME, ENTRY_FILE_NAME);
		return null;
	} catch (error) {
		return error;
	}
};

const findTranslationUnit = (buildDirectory) => {
	if (!existsSync(buildDirectory)) {
		return null;
	}
	return (
		readdirSync(buildDirectory).find((fileName) => {
			return fileName.endsWith(TRANSLATION_UNIT_EXTENSION);
		}) ?? null
	);
};

const checkGeneratedProjectBuilds = async (
	rootDirectory,
	templateDirectory,
) => {
	const projectDirectory = join(rootDirectory, BUILD_PROJECT_DIRECTORY_NAME);
	cpSync(templateDirectory, projectDirectory, { recursive: true });
	writeFileSync(
		join(projectDirectory, ENTRY_FILE_NAME),
		TRIVIAL_ENTRY_SOURCE,
		UTF8,
	);
	const buildError = await captureBuildFailure(projectDirectory);
	const translationUnit = findTranslationUnit(
		join(projectDirectory, BUILD_DIRECTORY_NAME, TESTER_PLATFORM_NAME),
	);

	return [
		expectEqual(
			"hermetic copy receives the scenario entry",
			readFileSync(join(projectDirectory, ENTRY_FILE_NAME), UTF8),
			TRIVIAL_ENTRY_SOURCE,
		),
		expectEqual(
			"hermetic project builds without packages/test/testers",
			buildError,
			null,
		),
		expectEqual(
			"hermetic build generates a translation unit",
			translationUnit !== null,
			true,
		),
	];
};

export const runCodegenHermeticChecks = async () => {
	const rootDirectory = mkdtempSync(
		join(tmpdir(), CODEGEN_HERMETIC_TEMP_DIRECTORY_PREFIX),
	);

	try {
		const templateDirectory = await createProject(
			rootDirectory,
			TESTER_PLATFORM_NAME,
		);
		return [
			...checkTemplateLocation(rootDirectory, templateDirectory),
			...checkTemplateStructure(templateDirectory),
			...(await checkGeneratedProjectBuilds(rootDirectory, templateDirectory)),
		];
	} finally {
		rmSync(rootDirectory, { recursive: true, force: true });
	}
};
