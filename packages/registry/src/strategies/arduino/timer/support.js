import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, COMMON_SOURCE } = loadTemplates(import.meta, {
	TEMPLATE: "timer.h",
	COMMON_SOURCE: "../../shared/timer/timer_common.inc",
});

import { resolveEnumMember } from "../../shared/timer/common.js";
import { buildTimerSupport } from "./timer-support.js";

const renderInclude = () => {
	return renderArtifactInclude("timer");
};

const generateSupport = (platform) => {
	const timerSupport = buildTimerSupport(platform?.timers);
	return TEMPLATE.replace(
		"_e95_replace_timerCommon",
		COMMON_SOURCE.trimEnd(),
	).replace("_e95_replace_timerSupport", timerSupport);
};

export const definition = {
	name: "arduino",
	dependencies: ["type", "gpio", "time"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
};
