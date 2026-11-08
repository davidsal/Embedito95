import { supportedPlatforms } from "embedito95-registry/platforms";
import { strategies } from "embedito95-registry/strategies";
import { select } from "../shared/prompt.js";
import {
	checkPlatformRequirements,
	isAnyUnsatisfied,
} from "../shared/requirements.js";

const FAMILY_SELECT_MESSAGE = "Select target family";
const BOARD_SELECT_MESSAGE = "Select board";

const exitIfUnsatisfied = ({ requirements }) => {
	if (isAnyUnsatisfied({ requirements })) {
		process.exit(1);
	}
};

const listStrategyPlatforms = ({ strategyName }) => {
	return supportedPlatforms.filter((platform) => {
		return platform.strategy === strategyName;
	});
};

const toChoice = ({ name, value }) => {
	return { name, value };
};

export const run = async () => {
	const strategyChoices = Object.values(strategies).map((strategy) => {
		return toChoice({ name: strategy.displayName, value: strategy.name });
	});
	const strategyName = await select({
		message: FAMILY_SELECT_MESSAGE,
		choices: strategyChoices,
	});
	const strategyPlatforms = listStrategyPlatforms({ strategyName });
	const board = await select({
		message: BOARD_SELECT_MESSAGE,
		choices: strategyPlatforms.map((platform) => {
			return toChoice({ name: platform.displayName, value: platform.name });
		}),
	});
	const platform = strategyPlatforms.find((candidate) => {
		return candidate.name === board;
	});
	const requirements = await checkPlatformRequirements({ platform });
	exitIfUnsatisfied({ requirements });
};
