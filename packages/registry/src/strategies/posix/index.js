import {
	CLANG_NOT_FOUND_MESSAGE,
	compile,
	findClangCompiler,
} from "./compile.js";
import { execute } from "./execute.js";
import { generate } from "./generate.js";
import { profile } from "./profile.js";

const STRATEGY_NAME = "posix";
const STRATEGY_PACKAGE = "@embedito95/posix-strategy";
const STRATEGY_VERSION = "0.1.0";
const PLATFORM_TOOLCHAIN_LABEL = "Platform toolchain";

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
			label: PLATFORM_TOOLCHAIN_LABEL,
			satisfied: findClangCompiler({ spawnSync }) !== null,
			fixHint: CLANG_NOT_FOUND_MESSAGE,
		},
	];
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
};
