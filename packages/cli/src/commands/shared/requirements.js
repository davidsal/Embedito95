import { spawnSync } from "node:child_process";
import { shared } from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { dim, green, red, writeLine } from "../../console.js";
import { confirm, input } from "./prompt.js";

const findPlatformStrategy = ({ platform }) => {
	return strategies[platform.strategy];
};

const printRequirements = ({ requirements }) => {
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
	const strategy = strategyTable[platform.strategy];
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
	const strategy = strategyTable[platform.strategy];

	if (strategy.prepare) {
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
}) => {
	const strategy = findPlatformStrategy({ platform });
	const requirements = getPlatformRequirements({ platform });
	printRequirements({ requirements });

	if (!isAnyUnsatisfied({ requirements }) || !strategy.doctorRepair) {
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

	const recheckedRequirements = getPlatformRequirements({ platform });
	writeLine("");
	printRequirements({ requirements: recheckedRequirements });

	return recheckedRequirements;
};
