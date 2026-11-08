import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UTF8 } from "embedito95-core";
import { run as runInterruptPostInstall } from "../registry/src/strategies/shared/interrupt/post-install.js";
import { run as runTimerPostInstall } from "../registry/src/strategies/shared/timer/post-install.js";
import { REGISTRY_LIBRARIES_DIRECTORY } from "./constants.js";
import { expectEqual } from "./reporting.js";

const TIMER_LIBRARY_FILE = join("core", "timer", "main.e95");
const TIMER_PROJECT_PREFIX = "embedito95-timer-post-install-";
const TIMER_ENUM_OPEN = "export enum Timer {";
const TIMER_ENUM_CLOSE = "}";
const TIMER_DOC_PREFIX = "@member";

const INTERRUPT_LIBRARY_FILE = join("core", "interrupt", "main.e95");
const INTERRUPT_PROJECT_PREFIX = "embedito95-interrupt-post-install-";
const INTERRUPT_RULES_MARKER = "e95.postinstall.interruptRules";
const ALLOWED_VALUES_MARKER = "e95.allowedValues";

const TIMER_PLATFORM = {
	timers: {
		available: [
			{ name: "TIMER_0", number: 0, resolution: 8, reservedByMillis: true },
			{ name: "TIMER_1", number: 1, resolution: 16 },
			{ name: "TIMER_2", number: 2, resolution: 8 },
		],
	},
};

const INTERRUPT_PLATFORM = {
	interrupts: {
		available: [
			{
				name: "INTERRUPT_0",
				pin: 2,
				triggers: ["LOW", "CHANGE", "RISING", "FALLING"],
			},
			{
				name: "INTERRUPT_1",
				pin: 3,
				triggers: ["LOW", "CHANGE", "RISING", "FALLING"],
			},
		],
	},
};

const EMPTY_INTERRUPT_PLATFORM = {};

const createLibraryProject = (libraryName, projectPrefix) => {
	const projectDirectory = mkdtempSync(join(tmpdir(), projectPrefix));
	const libraryDirectory = join(projectDirectory, "core", libraryName);
	mkdirSync(libraryDirectory, { recursive: true });
	writeFileSync(
		join(projectDirectory, "core", libraryName, "main.e95"),
		readFileSync(
			join(REGISTRY_LIBRARIES_DIRECTORY, libraryName, "main.e95"),
			UTF8,
		),
		UTF8,
	);

	return projectDirectory;
};

const createTimerProject = () => {
	return createLibraryProject("timer", TIMER_PROJECT_PREFIX);
};

const createInterruptProject = () => {
	return createLibraryProject("interrupt", INTERRUPT_PROJECT_PREFIX);
};

const readAllowedValueLines = (content) => {
	return content
		.split("\n")
		.map((line) => {
			return line.trim();
		})
		.filter((line) => {
			return line.startsWith(`// ${ALLOWED_VALUES_MARKER}`);
		});
};

const readTimerEnumMembers = (content) => {
	const openIndex = content.indexOf(TIMER_ENUM_OPEN);
	const closeIndex = content.indexOf(
		TIMER_ENUM_CLOSE,
		openIndex + TIMER_ENUM_OPEN.length,
	);
	const body = content.slice(openIndex + TIMER_ENUM_OPEN.length, closeIndex);

	return body
		.split(",")
		.map((entry) => {
			return entry.trim();
		})
		.filter((entry) => {
			return entry.length > 0;
		});
};

const readTimerEnumDocs = (content) => {
	return content
		.split("\n")
		.map((line) => {
			return line.trim();
		})
		.filter((line) => {
			return line.startsWith(`* ${TIMER_DOC_PREFIX}`);
		});
};

const checkTimerPostInstallFiltersReservedTimer = () => {
	const projectDirectory = createTimerProject();

	try {
		runTimerPostInstall(projectDirectory, TIMER_PLATFORM);
		const content = readFileSync(
			join(projectDirectory, TIMER_LIBRARY_FILE),
			UTF8,
		);
		const members = readTimerEnumMembers(content);
		const docs = readTimerEnumDocs(content);

		return [
			expectEqual(
				"timer post-install keeps every selectable counter",
				members.join(","),
				"1,2",
			),
			expectEqual(
				"timer post-install omits the counter reserved by the millisecond clock",
				members.includes("0"),
				false,
			),
			expectEqual(
				"timer post-install documents only selectable counters",
				docs.join("|"),
				"* @member 1 TIMER_1|* @member 2 TIMER_2",
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const checkInterruptPostInstallInjectsAllowedValues = () => {
	const projectDirectory = createInterruptProject();

	try {
		runInterruptPostInstall(projectDirectory, INTERRUPT_PLATFORM);
		const content = readFileSync(
			join(projectDirectory, INTERRUPT_LIBRARY_FILE),
			UTF8,
		);
		const rules = readAllowedValueLines(content);

		return [
			expectEqual(
				"interrupt post-install injects the pin rules for every pin-taking function",
				rules
					.filter((line) => {
						return line.endsWith(" pin 2,3");
					})
					.join("|"),
				"// e95.allowedValues attachPinInterrupt pin 2,3|// e95.allowedValues detachPinInterrupt pin 2,3|// e95.allowedValues getInterruptNumber pin 2,3",
			),
			expectEqual(
				"interrupt post-install injects the trigger rules for attachPinInterrupt",
				rules.includes(
					"// e95.allowedValues attachPinInterrupt mode LOW,CHANGE,RISING,FALLING",
				),
				true,
			),
			expectEqual(
				"interrupt post-install removes the marker",
				content.includes(INTERRUPT_RULES_MARKER),
				false,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const checkInterruptPostInstallWithoutPlatformData = () => {
	const projectDirectory = createInterruptProject();

	try {
		runInterruptPostInstall(projectDirectory, EMPTY_INTERRUPT_PLATFORM);
		const content = readFileSync(
			join(projectDirectory, INTERRUPT_LIBRARY_FILE),
			UTF8,
		);

		return [
			expectEqual(
				"interrupt post-install without platform data injects no rules",
				readAllowedValueLines(content).length,
				0,
			),
			expectEqual(
				"interrupt post-install without platform data removes the marker",
				content.includes(INTERRUPT_RULES_MARKER),
				false,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

export const runRegistryPostInstallChecks = () => {
	return [
		...checkTimerPostInstallFiltersReservedTimer(),
		...checkInterruptPostInstallInjectsAllowedValues(),
		...checkInterruptPostInstallWithoutPlatformData(),
	];
};
