import { spawnSync } from "node:child_process";
import { shared } from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { dim, green, red, writeLine } from "../../console.js";
import { confirm, input } from "./prompt.js";

const MISSING_STRATEGY_REQUIREMENT_LABEL = "Platform toolchain";
const MISSING_STRATEGY_FIX_HINT =
	"Compilation for this platform is not implemented yet";

const findPlatformStrategy = ({ platform, strategyTable = strategies }) => {
	return strategyTable[platform.strategy] ?? null;
};

const createMissingStrategyRequirements = () => {
	return [
		{
			label: MISSING_STRATEGY_REQUIREMENT_LABEL,
			satisfied: false,
			fixHint: MISSING_STRATEGY_FIX_HINT,
		},
	];
};

export const printRequirements = ({ requirements }) => {
	for (const requirement of requirements) {
		const symbol = requirement.satisfied ? green("✔") : red("✖");
		writeLine(`${symbol} ${requirement.label}`);

		if (!requirement.satisfied && requirement.fixHint) {
			writeLine(`   ${dim(requirement.fixHint)}`);
		}
	}
};

export const isAnyUnsatisfied = ({ requirements }) => {
	return requirements.some((requirement) => {
		return !requirement.satisfied;
	});
};

export const getPlatformRequirements = ({
	platform,
	strategyTable = strategies,
	spawnSync: runSpawnSync = spawnSync,
}) => {
	const strategy = findPlatformStrategy({ platform, strategyTable });

	if (!strategy) {
		return createMissingStrategyRequirements();
	}

	return strategy.doctorRequirements({
		platform,
		shared,
		spawnSync: runSpawnSync,
	});
};

export const ensurePlatformRequirements = async ({
	platform,
	log = writeLine,
	strategyTable = strategies,
	spawnSync: runSpawnSync = spawnSync,
}) => {
	const strategy = findPlatformStrategy({ platform, strategyTable });

	if (strategy?.prepare) {
		await strategy.prepare({ log, platform, shared });
	}

	return getPlatformRequirements({
		platform,
		strategyTable,
		spawnSync: runSpawnSync,
	});
};

export const checkPlatformRequirements = async ({
	log = writeLine,
	platform,
	strategyTable = strategies,
}) => {
	const strategy = findPlatformStrategy({ platform, strategyTable });
	const requirements = getPlatformRequirements({ platform, strategyTable });
	printRequirements({ requirements });

	if (!isAnyUnsatisfied({ requirements }) || !strategy?.doctorRepair) {
		return requirements;
	}

	const repaired = await strategy.doctorRepair({
		confirm,
		log,
		readText: input,
		requirements,
		shared,
	});

	if (!repaired) {
		return requirements;
	}

	const recheckedRequirements = getPlatformRequirements({
		platform,
		strategyTable,
	});
	writeLine("");
	printRequirements({ requirements: recheckedRequirements });

	return recheckedRequirements;
};
