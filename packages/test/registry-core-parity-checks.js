import { readFileSync } from "node:fs";
import {
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import {
	CORE_TEMPLATES_FILE,
	REGISTRY_INT_TYPE_RESOLUTION_FILE,
	REGISTRY_STM32_LL_CONSTANTS_FILE,
	REGISTRY_STRATEGIES_ARDUINO_INDEX_FILE,
	REGISTRY_STRATEGIES_DIRECTORIES_FILE,
	REGISTRY_TEMPLATES_FILE,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

// Parity guards for the `registry` ↔ `core` wall (TICKET-35). The wall is
// structural, not accidental: `registry/package.json` declares no dependencies,
// `core` already imports `registry` (`core/src/project/install.js`), and a
// strategy `support.js` is loaded as a plain file through
// `import(\`file://${path}\`)` (`registry/src/strategies/index.js`), so it can
// only rely on its own relative copy. Importing `embedito95-core` from
// `registry` would therefore be a phantom dependency and a package cycle. The
// duplication is kept on purpose; these checks fail the moment the two copies
// drift or the registry side reaches for a package.
//
// Every check reads the registry source as text instead of importing it: a
// registry module that got a bare package import would be unresolvable, and a
// static import here would crash the whole runner instead of reporting the
// offending check as a mismatch.
const BARE_SPECIFIER_PATTERNS = [
	/(?:import|export)\b[^"']*?\bfrom\s*["']([^"']+)["']/g,
	/\bimport\s*["']([^"']+)["']/g,
];

const SELF_CONTAINED_COPY_FILES = [
	{
		label: "registry loadTemplates",
		filePath: REGISTRY_TEMPLATES_FILE,
	},
	{
		label: "registry layout directories",
		filePath: REGISTRY_STRATEGIES_DIRECTORIES_FILE,
	},
	{
		label: "registry int-type resolution",
		filePath: REGISTRY_INT_TYPE_RESOLUTION_FILE,
	},
];

const REGISTRY_LAYOUT_CONSTANTS = [
	{
		name: "LIBRARIES_DIRECTORY_NAME",
		coreValue: LIBRARIES_DIRECTORY_NAME,
	},
	{
		name: "CORE_LIBRARIES_DIRECTORY_NAME",
		coreValue: CORE_LIBRARIES_DIRECTORY_NAME,
	},
	{
		name: "MODULES_DIRECTORY_NAME",
		coreValue: MODULES_DIRECTORY_NAME,
	},
];

const RESIDUAL_LAYOUT_CONSTANT_NAMES = [
	"LIBRARIES_DIRECTORY_NAME",
	"CORE_LIBRARIES_DIRECTORY_NAME",
	"MODULES_DIRECTORY_NAME",
];

const RESIDUAL_STRATEGY_CONSTANT_FILES = [
	{
		label: "registry stm32-ll/constants.js",
		filePath: REGISTRY_STM32_LL_CONSTANTS_FILE,
	},
	{
		label: "registry arduino/index.js",
		filePath: REGISTRY_STRATEGIES_ARDUINO_INDEX_FILE,
	},
];

const normalizeLineEndings = (content) => {
	return content.replace(/\r\n/g, "\n");
};

const readNormalizedFile = (filePath) => {
	return normalizeLineEndings(readFileSync(filePath, UTF8));
};

const declaresConstant = (source, name) => {
	return new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=`).test(source);
};

const readExportedStringConstant = (source, name) => {
	const match = source.match(
		new RegExp(`export\\s+const\\s+${name}\\s*=\\s*["']([^"']*)["']`),
	);

	return match ? match[1] : null;
};

const isBareSpecifier = (specifier) => {
	return !(
		specifier.startsWith(".") ||
		specifier.startsWith("/") ||
		specifier.startsWith("node:") ||
		specifier.startsWith("file:")
	);
};

const collectBareSpecifiers = (source) => {
	const specifiers = new Set();

	for (const pattern of BARE_SPECIFIER_PATTERNS) {
		for (const match of source.matchAll(pattern)) {
			if (isBareSpecifier(match[1])) {
				specifiers.add(match[1]);
			}
		}
	}

	return [...specifiers];
};

const checkLoadTemplatesParity = () => {
	return [
		expectEqual(
			"registry loadTemplates matches the canonical core copy byte for byte",
			readNormalizedFile(REGISTRY_TEMPLATES_FILE),
			readNormalizedFile(CORE_TEMPLATES_FILE),
		),
	];
};

const checkSelfContainedCopies = () => {
	return SELF_CONTAINED_COPY_FILES.map(({ label, filePath }) => {
		return expectEqual(
			`${label} stays self-contained (no bare package import)`,
			collectBareSpecifiers(readNormalizedFile(filePath)).join(", "),
			"",
		);
	});
};

const checkRegistryLayoutConstantsParity = () => {
	const source = readNormalizedFile(REGISTRY_STRATEGIES_DIRECTORIES_FILE);

	return REGISTRY_LAYOUT_CONSTANTS.map(({ name, coreValue }) => {
		return expectEqual(
			`registry ${name} matches core`,
			readExportedStringConstant(source, name),
			coreValue,
		);
	});
};

const checkNoResidualLayoutConstantDeclarations = () => {
	const results = [];

	for (const { label, filePath } of RESIDUAL_STRATEGY_CONSTANT_FILES) {
		const source = readFileSync(filePath, UTF8);

		for (const name of RESIDUAL_LAYOUT_CONSTANT_NAMES) {
			results.push(
				expectEqual(
					`${label} no longer declares ${name}`,
					declaresConstant(source, name),
					false,
				),
			);
		}
	}

	return results;
};

export const runRegistryCoreParityChecks = () => {
	return [
		...checkLoadTemplatesParity(),
		...checkSelfContainedCopies(),
		...checkRegistryLayoutConstantsParity(),
		...checkNoResidualLayoutConstantDeclarations(),
	];
};
