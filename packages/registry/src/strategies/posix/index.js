import {
	CLANG_NOT_FOUND_MESSAGE,
	findClangCompiler,
	setClangPath,
} from "./clang.js";
import { compile } from "./compile.js";
import { execute } from "./execute.js";
import { generate } from "./generate.js";
import { profile } from "./profile.js";

const STRATEGY_NAME = "posix";
const STRATEGY_PACKAGE = "@embedito95/posix-strategy";
const STRATEGY_VERSION = "0.1.0";
const CLANG_REQUIREMENT_LABEL = "clang++";
const CLANG_PATH_CONFIRM = "Do you want to add the clang++ path?";
const CLANG_PATH_PROMPT =
	"clang++ executable or Xcode Command Line Tools directory";

const renderProjectInclude = ({ headerFileName }) => {
	return `#include "${headerFileName}"`;
};

const renderModuleInclude = ({ headerFileName }) => {
	return `#include "${headerFileName}"`;
};

const renderDependencyInclude = ({ headerFileName }) => {
	return `#include "${headerFileName}"`;
};

const doctorRequirements = ({ spawnSync } = {}) => {
	return [
		{
			label: CLANG_REQUIREMENT_LABEL,
			satisfied: findClangCompiler({ spawnSync }) !== null,
			fixHint: CLANG_NOT_FOUND_MESSAGE,
		},
	];
};

const isClangRequirementUnsatisfied = ({ requirements }) => {
	const requirement = requirements.find((candidate) => {
		return candidate.label === CLANG_REQUIREMENT_LABEL;
	});

	return Boolean(requirement) && !requirement.satisfied;
};

const doctorRepair = async ({ confirm, readText, requirements }) => {
	if (!isClangRequirementUnsatisfied({ requirements })) {
		return false;
	}

	const shouldConfigurePath = await confirm({
		message: CLANG_PATH_CONFIRM,
		default: true,
	});

	if (!shouldConfigurePath) {
		return false;
	}

	const answer = await readText({ message: CLANG_PATH_PROMPT });

	if (!answer) {
		return false;
	}

	return setClangPath({ path: answer.trim() });
};

export const strategy = {
	name: STRATEGY_NAME,
	package: STRATEGY_PACKAGE,
	version: STRATEGY_VERSION,
	...profile,
	generate,
	renderProjectInclude,
	renderModuleInclude,
	renderDependencyInclude,
	compile,
	execute,
	doctorRequirements,
	doctorRepair,
};
