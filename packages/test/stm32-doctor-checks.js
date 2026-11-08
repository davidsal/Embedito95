// Hermetic checks for the STM32 doctor flow and the platform-requirements
// orchestration (TICKET-97). The strategy table, spawn and logger are injected,
// so no check touches the real `~/.embedito95` or the network.
import { strategies } from "embedito95-registry/strategies";
import { ensurePlatformRequirements } from "../cli/src/commands/shared/requirements.js";
import { prepare } from "../registry/src/strategies/stm32-ll/prepare.js";
import { expectEqual } from "./reporting.js";

const STM32_STRATEGY_NAME = "stm32-ll";
const ARDUINO_STRATEGY_NAME = "arduino";
const CUBEIDE_REQUIREMENT_LABEL = "STM32CubeIDE";
const FIRMWARE_REQUIREMENT_LABEL = "STM32CubeF1 firmware";
const CUBEIDE_ROOT = "C:\\ST\\STM32CubeIDE_2.2.0\\STM32CubeIDE";
const FIRMWARE_CACHE = "C:\\Users\\test\\.embedito95\\cache\\STM32Cube_FW_F1";
const DOWNLOADED_FIRMWARE_CACHE = "downloaded-cache";
const SET_ROOT_RESULT = true;
const NOOP_LOG = () => {};

const createShared = ({
	toolchainFound = true,
	cubeProgrammerFound = true,
	firmwareFound = true,
	downloadedCache = DOWNLOADED_FIRMWARE_CACHE,
} = {}) => {
	const calls = {
		download: 0,
		setRoot: [],
	};
	const shared = {
		findStm32Toolchain: () => {
			return toolchainFound ? "/toolchain/bin" : null;
		},
		findStm32CubeProg: () => {
			return cubeProgrammerFound ? "/programmer/STM32_Programmer_CLI" : null;
		},
		findStm32FirmwareCache: () => {
			return firmwareFound ? FIRMWARE_CACHE : null;
		},
		setCubeIdeRoot: ({ root }) => {
			calls.setRoot.push(root);
			return SET_ROOT_RESULT;
		},
		downloadStm32FirmwareCache: async () => {
			calls.download += 1;
			return downloadedCache;
		},
	};

	return { calls, shared };
};

const createConfirm = ({ answers }) => {
	const messages = [];
	const confirm = async ({ message }) => {
		messages.push(message);
		return answers.shift() ?? false;
	};

	return { confirm, messages };
};

const createReadText = ({ answer = CUBEIDE_ROOT } = {}) => {
	const messages = [];
	const readText = async ({ message }) => {
		messages.push(message);
		return answer;
	};

	return { messages, readText };
};

const checkDoctorRequirements = () => {
	const { shared } = createShared();
	const requirements = strategies[STM32_STRATEGY_NAME].doctorRequirements({
		platform: {},
		shared,
		spawnSync: NOOP_LOG,
	});

	return [
		expectEqual(
			"stm32 doctor reports exactly two requirements",
			requirements.length,
			2,
		),
		expectEqual(
			"stm32 doctor reports the CubeIDE requirement",
			requirements[0].label,
			CUBEIDE_REQUIREMENT_LABEL,
		),
		expectEqual(
			"stm32 doctor reports the firmware requirement",
			requirements[1].label,
			FIRMWARE_REQUIREMENT_LABEL,
		),
		expectEqual(
			"stm32 doctor marks CubeIDE satisfied when both tools exist",
			requirements[0].satisfied,
			true,
		),
	];
};

const checkCubeIdeRequiresBothTools = () => {
	const missingToolchain = createShared({ toolchainFound: false });
	const missingProgrammer = createShared({ cubeProgrammerFound: false });
	const checkRequirements = ({ shared }) => {
		return strategies[STM32_STRATEGY_NAME].doctorRequirements({
			platform: {},
			shared,
			spawnSync: NOOP_LOG,
		});
	};

	return [
		expectEqual(
			"stm32 doctor marks CubeIDE unsatisfied without the toolchain",
			checkRequirements({ shared: missingToolchain.shared })[0].satisfied,
			false,
		),
		expectEqual(
			"stm32 doctor marks CubeIDE unsatisfied without the programmer",
			checkRequirements({ shared: missingProgrammer.shared })[0].satisfied,
			false,
		),
	];
};

const checkDoctorRepairDownloadsWhenAccepted = async () => {
	const { calls, shared } = createShared({
		toolchainFound: false,
		firmwareFound: false,
	});
	const { confirm } = createConfirm({ answers: [true, true] });
	const { readText } = createReadText();
	const requirements = strategies[STM32_STRATEGY_NAME].doctorRequirements({
		platform: {},
		shared,
		spawnSync: NOOP_LOG,
	});
	const repaired = await strategies[STM32_STRATEGY_NAME].doctorRepair({
		confirm,
		log: NOOP_LOG,
		readText,
		requirements,
		shared,
	});

	return [
		expectEqual(
			"stm32 doctor repair asks for the CubeIDE root",
			calls.setRoot[0],
			CUBEIDE_ROOT,
		),
		expectEqual(
			"stm32 doctor repair downloads the firmware when accepted",
			calls.download,
			1,
		),
		expectEqual("stm32 doctor repair reports a repair", repaired, true),
	];
};

const checkDoctorRepairSkipsWhenRejected = async () => {
	const { calls, shared } = createShared({
		toolchainFound: false,
		firmwareFound: false,
	});
	const { confirm } = createConfirm({ answers: [false, false] });
	const { readText } = createReadText();
	const requirements = strategies[STM32_STRATEGY_NAME].doctorRequirements({
		platform: {},
		shared,
		spawnSync: NOOP_LOG,
	});
	const repaired = await strategies[STM32_STRATEGY_NAME].doctorRepair({
		confirm,
		log: NOOP_LOG,
		readText,
		requirements,
		shared,
	});

	return [
		expectEqual(
			"stm32 doctor repair does not set the root when rejected",
			calls.setRoot.length,
			0,
		),
		expectEqual(
			"stm32 doctor repair does not download when rejected",
			calls.download,
			0,
		),
		expectEqual("stm32 doctor repair reports no repair", repaired, false),
	];
};

const checkDoctorRepairWithoutMissingRequirements = async () => {
	const { calls, shared } = createShared();
	const { confirm, messages } = createConfirm({ answers: [] });
	const { readText } = createReadText();
	const requirements = strategies[STM32_STRATEGY_NAME].doctorRequirements({
		platform: {},
		shared,
		spawnSync: NOOP_LOG,
	});
	const repaired = await strategies[STM32_STRATEGY_NAME].doctorRepair({
		confirm,
		log: NOOP_LOG,
		readText,
		requirements,
		shared,
	});

	return [
		expectEqual(
			"stm32 doctor repair does not prompt when satisfied",
			messages.length,
			0,
		),
		expectEqual(
			"stm32 doctor repair reports no repair when satisfied",
			repaired,
			false,
		),
		expectEqual(
			"stm32 doctor repair does not download when satisfied",
			calls.download,
			0,
		),
	];
};

const checkPrepareUsesExistingCache = async () => {
	let downloadCalls = 0;
	const cache = await prepare({
		log: NOOP_LOG,
		shared: {
			findStm32FirmwareCache: () => {
				return FIRMWARE_CACHE;
			},
			downloadStm32FirmwareCache: async () => {
				downloadCalls += 1;
				return FIRMWARE_CACHE;
			},
		},
	});

	return [
		expectEqual(
			"stm32 prepare returns the existing cache",
			cache,
			FIRMWARE_CACHE,
		),
		expectEqual(
			"stm32 prepare does not download with an existing cache",
			downloadCalls,
			0,
		),
	];
};

const checkPrepareDownloadsWithoutCache = async () => {
	let downloadCalls = 0;
	const cache = await prepare({
		log: NOOP_LOG,
		shared: {
			findStm32FirmwareCache: () => {
				return null;
			},
			downloadStm32FirmwareCache: async () => {
				downloadCalls += 1;
				return DOWNLOADED_FIRMWARE_CACHE;
			},
		},
	});

	return [
		expectEqual(
			"stm32 prepare downloads when the cache is missing",
			downloadCalls,
			1,
		),
		expectEqual(
			"stm32 prepare returns the downloaded cache",
			cache,
			DOWNLOADED_FIRMWARE_CACHE,
		),
	];
};

const createStrategyTable = ({ prepareCalls, confirmCalls }) => {
	return {
		[STM32_STRATEGY_NAME]: {
			prepare: async () => {
				prepareCalls.push(STM32_STRATEGY_NAME);
			},
			doctorRequirements: () => {
				return [
					{
						label: CUBEIDE_REQUIREMENT_LABEL,
						satisfied: true,
					},
					{
						label: FIRMWARE_REQUIREMENT_LABEL,
						satisfied: true,
					},
				];
			},
			doctorRepair: async ({ confirm }) => {
				confirmCalls.push(confirm);
				return true;
			},
		},
		[ARDUINO_STRATEGY_NAME]: {
			doctorRequirements: () => {
				return [
					{
						label: "arduino-cli",
						satisfied: true,
					},
				];
			},
		},
	};
};

const checkEnsurePlatformRequirementsPreparesWithoutPrompting = async () => {
	const prepareCalls = [];
	const confirmCalls = [];
	const requirements = await ensurePlatformRequirements({
		platform: { strategy: STM32_STRATEGY_NAME },
		log: NOOP_LOG,
		strategyTable: createStrategyTable({ prepareCalls, confirmCalls }),
		spawnSync: NOOP_LOG,
	});

	return [
		expectEqual(
			"ensurePlatformRequirements runs the stm32 prepare hook",
			prepareCalls.length,
			1,
		),
		expectEqual(
			"ensurePlatformRequirements runs the stm32 prepare hook once",
			prepareCalls[0],
			STM32_STRATEGY_NAME,
		),
		expectEqual(
			"ensurePlatformRequirements does not ask before preparing",
			confirmCalls.length,
			0,
		),
		expectEqual(
			"ensurePlatformRequirements returns the checked requirements",
			requirements.length,
			2,
		),
	];
};

const checkEnsurePlatformRequirementsKeepsPlatformsWithoutPrepare =
	async () => {
		const prepareCalls = [];
		const confirmCalls = [];
		const requirements = await ensurePlatformRequirements({
			platform: { strategy: ARDUINO_STRATEGY_NAME },
			log: NOOP_LOG,
			strategyTable: createStrategyTable({ prepareCalls, confirmCalls }),
			spawnSync: NOOP_LOG,
		});

		return [
			expectEqual(
				"ensurePlatformRequirements skips prepare for platforms without it",
				prepareCalls.length,
				0,
			),
			expectEqual(
				"ensurePlatformRequirements returns arduino requirements",
				requirements[0].label,
				"arduino-cli",
			),
		];
	};

export const runStm32DoctorChecks = async () => {
	return [
		...checkDoctorRequirements(),
		...checkCubeIdeRequiresBothTools(),
		...(await checkDoctorRepairDownloadsWhenAccepted()),
		...(await checkDoctorRepairSkipsWhenRejected()),
		...(await checkDoctorRepairWithoutMissingRequirements()),
		...(await checkPrepareUsesExistingCache()),
		...(await checkPrepareDownloadsWithoutCache()),
		...(await checkEnsurePlatformRequirementsPreparesWithoutPrompting()),
		...(await checkEnsurePlatformRequirementsKeepsPlatformsWithoutPrepare()),
	];
};
