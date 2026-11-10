import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	shared,
	UTF8,
} from "embedito95-core";

const PACKAGE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PACKAGE_DIRECTORY, "../..");

export const REGISTRY_LIBRARIES_DIRECTORY = join(
	PROJECT_ROOT,
	"packages/registry/src/core",
);
export const REGISTRY_SOURCE_DIRECTORY = join(
	PROJECT_ROOT,
	"packages/registry/src",
);
export const REGISTRY_CLIENT_LIBRARIES_DIRECTORY = join(
	PROJECT_ROOT,
	"packages/registry/src/libraries",
);
export const REGISTRY_PLATFORMS_DIRECTORY = join(
	PROJECT_ROOT,
	"packages/registry/src/platforms",
);
export const REGISTRY_INT128_TEMPLATE_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/shared/int128/int128.cpp",
);
export const REGISTRY_TEMPLATES_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/shared/templates.js",
);
export const REGISTRY_STRATEGIES_ARDUINO_INDEX_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/arduino/index.js",
);
export const REGISTRY_STM32_LL_CONSTANTS_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/stm32-ll/constants.js",
);
export const REGISTRY_STRATEGIES_DIRECTORIES_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/shared/directories.js",
);
export const REGISTRY_INT_TYPE_RESOLUTION_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/shared/int-type-resolution.js",
);
export const CORE_TEMPLATES_FILE = join(
	PROJECT_ROOT,
	"packages/core/src/strategy-shared/templates.js",
);
export const CLI_PATH = join(PROJECT_ROOT, "packages/cli/src/cli.js");
export const ROOT_PACKAGE_FILE = join(PROJECT_ROOT, "package.json");
export const DOCS_DIRECTORIES = [
	join(PROJECT_ROOT, "docs"),
	join(PROJECT_ROOT, "packages/cli/docs"),
];
export const TEST_SOURCES_DIRECTORY = join(PACKAGE_DIRECTORY, "src");

export const LANGUAGE_DIRECTORY_NAME = "language";
export const FORMATTER_DIRECTORY_NAME = "formatter";
export const ENGINE_DIRECTORY_NAME = "engine";
export const EXAMPLES_DIRECTORY_NAME = "examples";
export const CORE_CATEGORY_NAME = "core";

const readLibraryConfiguration = (libraryDirectory) => {
	const configurationPath = join(libraryDirectory, CONFIG_FILE);

	if (!existsSync(configurationPath)) {
		return null;
	}

	try {
		return JSON.parse(readFileSync(configurationPath, UTF8));
	} catch {
		return null;
	}
};

const isLibraryConfiguration = (configuration) => {
	return configuration?.type === LIBRARY_PROJECT_TYPE;
};

const listClientLibraryBasenames = (librariesDirectory) => {
	return readdirSync(librariesDirectory, { withFileTypes: true })
		.filter((entry) => {
			return entry.isDirectory();
		})
		.filter((entry) => {
			const configuration = readLibraryConfiguration(
				join(librariesDirectory, entry.name),
			);
			return isLibraryConfiguration(configuration);
		})
		.map((entry) => {
			return entry.name;
		})
		.sort();
};

export const CLIENT_LIBRARY_BASENAMES = listClientLibraryBasenames(
	REGISTRY_CLIENT_LIBRARIES_DIRECTORY,
);
export const SNAPSHOT_DIRECTORY_NAME = "snapshots";
export const COMPILE_SIZES_SNAPSHOT_FILE = join(
	PACKAGE_DIRECTORY,
	SNAPSHOT_DIRECTORY_NAME,
	"compile-sizes.json",
);
export const FORMATTER_COPIES_DIRECTORY_NAME = `${FORMATTER_DIRECTORY_NAME}-copies`;
export const ARTIFACTS_DIRECTORY_NAME = "artifacts";

export const GITIGNORE_FILE = ".gitignore";
export const GITIGNORE_CONTENT = `${BUILD_DIRECTORY_NAME}\n${CORE_LIBRARIES_DIRECTORY_NAME}\n`;

export const TEST_ENTRY_SUFFIX_PATTERN = /\.test\.e95$/;
export const ENTRY_SUFFIX_PATTERN = /\.e95$/;

export const EMBEDITO95_PROJECT_VERSION = "embedito95@0.1.0";
export const NODE_EXECUTABLE = "node";
export const INSTALL_COMMAND = "install";
export const BUILD_COMMAND = "build";
export const UPDATE_SNAPSHOTS_FLAG = "--update";
export const WRITE_FLAG = "--write";
export const SNAPSHOT_TEMP_DIRECTORY_PREFIX = "embedito95-test-";
export const CLI_PROJECT_TEMP_DIRECTORY_PREFIX = "embedito95-cli-project-";
export const COMPILE_TEMP_DIRECTORY_PREFIX = "embedito95-compile-";
export const COMPILE_CONCURRENCY_ENVIRONMENT_KEY =
	"E95_TEST_COMPILE_CONCURRENCY";
export const COMPILE_FAST_ENVIRONMENT_KEY = "E95_TEST_COMPILE_FAST";
export const COMPILE_UPDATE_SNAPSHOTS_ENVIRONMENT_KEY =
	"E95_TEST_COMPILE_UPDATE_SNAPSHOTS";
export const NO_SPINNER_ENVIRONMENT_KEY = "E95_NO_SPINNER";
export const DEFAULT_MAXIMUM_COMPILE_CONCURRENCY = 8;
export const MINIMUM_COMPILE_CONCURRENCY = 1;
export const STM32_MAXIMUM_PROJECT_CONCURRENCY = 4;
export const STM32_TOTAL_COMPILE_JOB_BUDGET = 8;
export const COMPILE_FAST_ENABLED_VALUE = "1";
export const COMPILE_UPDATE_SNAPSHOTS_ENABLED_VALUE = "1";
export const EXCLUDED_TEST_SKIP_REASON = "not supported on this platform";
export const ARDUINO_CLI_COMMAND = "arduino-cli";
export const ARM_SIZE_COMMAND_NAME = shared.ARM_SIZE_EXECUTABLE;
export const ARDUINO_CORE_IDENTIFIER = "arduino:avr";
export const AVR_ARTIFACT_EXTENSION = ".hex";
export const STM32_ARTIFACT_EXTENSIONS = [".elf", ".bin"];
export const COMPILE_TEST_SOURCES_PLATFORM_BY_PLATFORM = {
	"arduino-nano": "arduino-nano",
	"stm32-bluepill": "stm32-bluepill",
};
export const COMPILE_PLATFORM_KIND = {
	arduino: "arduino",
	stm32: "stm32",
};
export const COMPILE_RESULT_STATUS = {
	compiled: "compiled",
	failed: "failed",
	skipped: "skipped",
};
export const COMPILE_FQBN_BY_PLATFORM = {
	"arduino-nano": "arduino:avr:nano",
};
export const COMPILE_STRATEGY_BY_PLATFORM = {
	"stm32-bluepill": "stm32-ll",
};
export const COMPILE_PLATFORM_ORDER = ["arduino-nano", "stm32-bluepill"];
export const COMPILE_PLATFORM_KIND_BY_PLATFORM = {
	"arduino-nano": "arduino",
	"stm32-bluepill": "stm32",
};

export const COMPILE_CATEGORY_INDENTATION = "  ";
export const COMPILE_TEST_INDENTATION = "    ";
export const COMPILE_DIAGNOSTIC_INDENTATION = "      ";

export const GREEN_CHECK = "\x1b[32m✔\x1b[39m";
export const RED_CROSS = "\x1b[31m✖\x1b[39m";
export const SKIP_MARK = "○";

export const SNAPSHOT_STATUS = {
	created: "created",
	match: "match",
	mismatch: "mismatch",
};

export const COMPILE_SIZES_SNAPSHOT_STATUS = {
	updated: "updated",
	created: "created",
	match: "match",
	mismatch: "mismatch",
};

export const ASYNC_LOCAL_TYPES_UNIT_CHECKS_GROUP = "async-local-types";
export const ASYNC_TASK_TYPE_UNIT_CHECKS_GROUP = "async-task-type";
export const CLI_PROJECT_UNIT_CHECKS_GROUP = "cli-project";
export const MONITOR_STATE_UNIT_CHECKS_GROUP = "monitor-state";
export const CORE_SURFACE_UNIT_CHECKS_GROUP = "core-surface";
export const CLOSURE_FACTORY_UNIT_CHECKS_GROUP = "closure-factory";
export const REGISTRY_DOC_COMMENT_UNIT_CHECKS_GROUP = "registry-doc-comments";
export const REGISTRY_ENUM_RESOLUTION_UNIT_CHECKS_GROUP =
	"registry-enum-resolution";
export const REGISTRY_INT128_NEGATION_UNIT_CHECKS_GROUP =
	"registry-int128-negation";
export const REGISTRY_POST_INSTALL_UNIT_CHECKS_GROUP = "registry-post-install";
export const REGISTRY_CORE_PARITY_UNIT_CHECKS_GROUP = "registry-core-parity";
export const REGISTRY_STM32_PARALLEL_COMPILE_UNIT_CHECKS_GROUP =
	"registry-stm32-parallel-compile";
export const STM32_FIRMWARE_UNIT_CHECKS_GROUP = "stm32-firmware";
export const STM32_CUBEIDE_UNIT_CHECKS_GROUP = "stm32-cubeide";
export const STM32_DOCTOR_UNIT_CHECKS_GROUP = "stm32-doctor";
export const REGISTRY_INT_TYPE_PARITY_UNIT_CHECKS_GROUP =
	"registry-int-type-parity";
export const LINT_POLICY_UNIT_CHECKS_GROUP = "lint-policy";
export const LSP_COMPLETION_UNIT_CHECKS_GROUP = "lsp-completion";
export const LSP_HOVER_UNIT_CHECKS_GROUP = "lsp-hover";
export const LSP_DIAGNOSTICS_UNIT_CHECKS_GROUP = "lsp-diagnostics";
export const SHARED_CONSTANTS_UNIT_CHECKS_GROUP = "shared-constants";
export const SUPPORTED_PLATFORMS_UNIT_CHECKS_GROUP = "supported-platforms";
export const TEST_COMPILE_UNIT_CHECKS_GROUP = "test-compile";
export const LINT_SCRIPT_NAME = "lint";
export const LINT_FIX_SCRIPT_NAME = "lint:fix";
export const DOC_COMMENT_SCAN_EXTENSIONS = [".e95", ".h", ".cpp"];
export const MONITOR_STATE_CONTENT_HEIGHT = 24;
export const MONITOR_STATE_WINDOW_CAPACITY = 3;

export const EXCLUDED_TESTS_BY_PLATFORM = {
	"stm32-bluepill": ["eeprom.test.e95"],
};
