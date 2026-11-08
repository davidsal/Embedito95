import { compile } from "./compile.js";
import { doctorRepair, doctorRequirements } from "./doctor.js";
import {
	generate,
	renderDependencyInclude,
	renderModuleInclude,
	renderProjectInclude,
} from "./generate.js";
import { prepare } from "./prepare.js";
import { profile } from "./profile.js";
import { detectPorts, upload } from "./upload.js";

export const strategy = {
	name: "stm32-ll",
	package: "@embedito95/stm32-ll-strategy",
	version: "0.1.0",
	...profile,
	generate,
	renderProjectInclude,
	renderModuleInclude,
	renderDependencyInclude,
	compile,
	prepare,
	upload,
	detectPorts,
	doctorRequirements,
	doctorRepair,
};
