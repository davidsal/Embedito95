// Size extraction and size-snapshot helpers for `test:compile`. Compilers expose
// their used flash/RAM in different formats: Arduino reports executable section
// sizes as JSON, while the ARM toolchain prints a `text data bss` table.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { UTF8 } from "embedito95-core";
import {
	COMPILE_RESULT_STATUS,
	COMPILE_SIZES_SNAPSHOT_STATUS,
	GREEN_CHECK,
} from "./constants.js";

const ARDUINO_FLASH_SECTION_NAME = "text";
const ARDUINO_RAM_SECTION_NAME = "data";
const ARM_SIZE_COLUMNS = ["text", "data", "bss"];
const ARM_SIZE_COLUMN_COUNT = 4;
const COMPILE_SIZE_FIELDS = ["flash", "ram", "flashMax", "ramMax"];
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_MAXIMUM = 100;
const SNAPSHOT_INDENTATION = "\t";
const UNKNOWN_SIZE = "?";

const isFiniteNumber = (value) => {
	return Number.isFinite(value);
};

const toFiniteNumberOrNull = (value) => {
	return isFiniteNumber(value) ? value : null;
};

const parseJsonSafely = (text) => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

const findExecutableSection = ({ sections, name }) => {
	return sections.find((section) => {
		return section.name === name;
	});
};

const resolveMaximumSize = (section, fallbackMaximum) => {
	return toFiniteNumberOrNull(section.max_size) ?? fallbackMaximum;
};

const createCompileSizes = ({ flash, ram, flashMax, ramMax }) => {
	if (
		!isFiniteNumber(flash) ||
		!isFiniteNumber(ram) ||
		!isFiniteNumber(flashMax) ||
		!isFiniteNumber(ramMax)
	) {
		return null;
	}

	return { flash, ram, flashMax, ramMax };
};

export const parseArduinoCompileSizes = ({ output, flashMax, ramMax }) => {
	const parsedOutput = parseJsonSafely(output);
	const sections = parsedOutput?.builder_result?.executable_sections_size;

	if (!Array.isArray(sections)) {
		return null;
	}

	const flashSection = findExecutableSection({
		sections,
		name: ARDUINO_FLASH_SECTION_NAME,
	});
	const ramSection = findExecutableSection({
		sections,
		name: ARDUINO_RAM_SECTION_NAME,
	});

	if (!flashSection || !ramSection) {
		return null;
	}

	return createCompileSizes({
		flash: flashSection.size,
		ram: ramSection.size,
		flashMax: resolveMaximumSize(flashSection, flashMax),
		ramMax: resolveMaximumSize(ramSection, ramMax),
	});
};

const findArmSizeColumns = (output) => {
	return output
		.split("\n")
		.map((line) => {
			return line.trim();
		})
		.filter((line) => {
			return line.length > 0;
		})
		.map((line) => {
			return line.split(/\s+/);
		})
		.find((columns) => {
			return (
				columns.length >= ARM_SIZE_COLUMN_COUNT &&
				columns.slice(0, ARM_SIZE_COLUMNS.length).every((column) => {
					return /^\d+$/.test(column);
				})
			);
		});
};

export const parseArmCompileSizes = ({ output, flashMax, ramMax }) => {
	const columns = findArmSizeColumns(output);

	if (!columns) {
		return null;
	}

	const [text, data, bss] = columns
		.slice(0, ARM_SIZE_COLUMNS.length)
		.map((column) => {
			return Number(column);
		});

	return createCompileSizes({
		flash: text + data,
		ram: data + bss,
		flashMax,
		ramMax,
	});
};

const formatPercentage = ({ used, maximum }) => {
	if (!isFiniteNumber(used) || !isFiniteNumber(maximum) || maximum === 0) {
		return "";
	}

	return ` (${((used / maximum) * PERCENT_MAXIMUM).toFixed(1)}%)`;
};

const formatSizeSection = ({ label, used, maximum }) => {
	const usedText = isFiniteNumber(used) ? String(used) : UNKNOWN_SIZE;
	const maximumText = isFiniteNumber(maximum) ? String(maximum) : UNKNOWN_SIZE;
	return `${label} ${usedText}/${maximumText}${formatPercentage({ used, maximum })}`;
};

export const formatCompileSizeText = (sizes) => {
	if (!sizes) {
		return `Flash ${UNKNOWN_SIZE} | RAM ${UNKNOWN_SIZE}`;
	}

	return [
		formatSizeSection({
			label: "Flash",
			used: sizes.flash,
			maximum: sizes.flashMax,
		}),
		formatSizeSection({
			label: "RAM",
			used: sizes.ram,
			maximum: sizes.ramMax,
		}),
	].join(" | ");
};

export const formatCompiledTestLine = ({
	name,
	durationMilliseconds,
	sizes,
}) => {
	const seconds = (durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(1);
	return `${GREEN_CHECK} ${name} — ${seconds}s — ${formatCompileSizeText(sizes)}`;
};

const createCompileSizeEntry = (sizes) => {
	return {
		flash: toFiniteNumberOrNull(sizes?.flash),
		ram: toFiniteNumberOrNull(sizes?.ram),
		flashMax: toFiniteNumberOrNull(sizes?.flashMax),
		ramMax: toFiniteNumberOrNull(sizes?.ramMax),
	};
};

const collectPlatformSizeEntries = (report) => {
	return report.results
		.filter((result) => {
			return result.status === COMPILE_RESULT_STATUS.compiled;
		})
		.map((result) => {
			return [
				result.label,
				createCompileSizeEntry(result.value?.sizes ?? result.sizes),
			];
		});
};

export const buildCompileSizesSnapshot = ({ reports }) => {
	return Object.fromEntries(
		reports
			.filter((report) => {
				return !report.skipReason;
			})
			.map((report) => {
				return [
					report.platformName,
					Object.fromEntries(collectPlatformSizeEntries(report)),
				];
			}),
	);
};

export const serializeCompileSizesSnapshot = (snapshot) => {
	return `${JSON.stringify(snapshot, null, SNAPSHOT_INDENTATION)}\n`;
};

const readCompileSizesSnapshot = (snapshotPath) => {
	return parseJsonSafely(readFileSync(snapshotPath, UTF8));
};

const writeCompileSizesSnapshot = (snapshotPath, snapshot) => {
	mkdirSync(dirname(snapshotPath), { recursive: true });
	writeFileSync(snapshotPath, serializeCompileSizesSnapshot(snapshot), UTF8);
};

const compareSizeFields = ({ label, expectedEntry, actualEntry }) => {
	return COMPILE_SIZE_FIELDS.flatMap((field) => {
		if (expectedEntry[field] === actualEntry[field]) {
			return [];
		}
		return [
			`${label}: ${field} expected ${expectedEntry[field]}, actual ${actualEntry[field]}`,
		];
	});
};

export const compareCompileSizesSnapshot = ({ expected, actual }) => {
	return Object.keys(actual).flatMap((platformName) => {
		const expectedPlatform = expected[platformName];

		if (!expectedPlatform) {
			return [`${platformName}: platform missing from snapshot`];
		}

		return Object.keys(actual[platformName]).flatMap((label) => {
			const expectedEntry = expectedPlatform[label];

			if (!expectedEntry) {
				return [`${label}: entry missing from snapshot`];
			}

			return compareSizeFields({
				label,
				expectedEntry,
				actualEntry: actual[platformName][label],
			});
		});
	});
};

export const processCompileSizesSnapshot = ({
	snapshotPath,
	snapshot,
	updateSnapshots,
}) => {
	if (updateSnapshots) {
		writeCompileSizesSnapshot(snapshotPath, snapshot);
		return {
			status: COMPILE_SIZES_SNAPSHOT_STATUS.updated,
			snapshotPath,
			messages: [],
		};
	}

	if (!existsSync(snapshotPath)) {
		writeCompileSizesSnapshot(snapshotPath, snapshot);
		return {
			status: COMPILE_SIZES_SNAPSHOT_STATUS.created,
			snapshotPath,
			messages: [],
		};
	}

	const expected = readCompileSizesSnapshot(snapshotPath);

	if (!expected) {
		return {
			status: COMPILE_SIZES_SNAPSHOT_STATUS.mismatch,
			snapshotPath,
			messages: [`${snapshotPath}: snapshot is not valid JSON`],
		};
	}

	const messages = compareCompileSizesSnapshot({ expected, actual: snapshot });

	if (messages.length > 0) {
		return {
			status: COMPILE_SIZES_SNAPSHOT_STATUS.mismatch,
			snapshotPath,
			messages,
		};
	}

	return {
		status: COMPILE_SIZES_SNAPSHOT_STATUS.match,
		snapshotPath,
		messages: [],
	};
};
