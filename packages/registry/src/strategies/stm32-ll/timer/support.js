import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE, COMMON_SOURCE } = loadTemplates(
	import.meta,
	{
		TEMPLATE: "timer.h",
		SOURCE_TEMPLATE: "timer.cpp",
		COMMON_SOURCE: "../../shared/timer/timer_common.inc",
	},
);

import { resolveEnumMember } from "../../shared/timer/common.js";

const APB2_BUS = "APB2";
const TIMER_PERIPHERAL_PREFIX = "TIM";
const ADVANCED_TIMER_NUMBER = 1;
const ADVANCED_TIMER_UPDATE_SUFFIX = "_UP";

const listTimerEntries = (timers) => {
	return (timers?.available ?? []).filter((entry) => {
		return (
			entry?.name &&
			entry?.number !== undefined &&
			entry?.number !== null &&
			!entry.reservedByMillis
		);
	});
};

const peripheralName = (entry) => {
	return `${TIMER_PERIPHERAL_PREFIX}${entry.number}`;
};

const resolvesFromApb2 = (entry) => {
	return entry.bus === APB2_BUS;
};

const clockEnableName = (entry) => {
	const group = resolvesFromApb2(entry) ? "APB2" : "APB1";
	return `LL_${group}_GRP1_PERIPH_${peripheralName(entry)}`;
};

const interruptName = (entry) => {
	const suffix =
		entry.number === ADVANCED_TIMER_NUMBER ? ADVANCED_TIMER_UPDATE_SUFFIX : "";
	return `${peripheralName(entry)}${suffix}_IRQn`;
};

const interruptHandlerName = (entry) => {
	const suffix =
		entry.number === ADVANCED_TIMER_NUMBER ? ADVANCED_TIMER_UPDATE_SUFFIX : "";
	return `${peripheralName(entry)}${suffix}_IRQHandler`;
};

const buildTimerEnum = (entries) => {
	const members = entries
		.map((entry) => {
			return `\t${entry.name} = ${entry.number}`;
		})
		.join(",\n");

	return `typedef enum : u8 {\n${members}\n} Timer;`;
};

const buildTimerDefinition = (entry) => {
	return `\t{ ${entry.number}, ${peripheralName(entry)}, ${entry.clock}, ${resolvesFromApb2(entry)}, ${clockEnableName(entry)}, ${interruptName(entry)} },`;
};

const buildTimerDefinitions = (entries) => {
	return entries.map(buildTimerDefinition).join("\n");
};

const buildInitializer = (value) => {
	return `\t${value},`;
};

const buildCallbackInitializers = (entries) => {
	return entries.map(() => buildInitializer("nullptr")).join("\n");
};

const buildToneInitializers = (entries) => {
	return entries.map(() => buildInitializer("TONE_NONE")).join("\n");
};

const buildInterruptHandler = (entry) => {
	const timer = peripheralName(entry);

	return [
		`extern "C" void ${interruptHandlerName(entry)}(void) {`,
		`\tif (LL_TIM_IsActiveFlag_UPDATE(${timer})) {`,
		`\t\tLL_TIM_ClearFlag_UPDATE(${timer});`,
		`\t\tcore_timer::timer_detail::runTimerCallback(${entry.number});`,
		"\t}",
		"}",
	].join("\n");
};

const buildInterruptHandlers = (entries) => {
	return entries.map(buildInterruptHandler).join("\n\n");
};

const buildGetTimerCase = (entry) => {
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\treturn HardwareTimer((u8)Timer::${entry.name});`,
		"\t\t}",
	].join("\n");
};

const buildGetTimerCases = (entries) => {
	return entries.map(buildGetTimerCase).join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("timer");
};

const generateSupport = (platform) => {
	const entries = listTimerEntries(platform?.timers);

	return TEMPLATE.replace("_e95_replace_timerEnum", buildTimerEnum(entries));
};

const generateSource = (platform) => {
	const entries = listTimerEntries(platform?.timers);

	return SOURCE_TEMPLATE.replace(
		"_e95_replace_timerCommon",
		COMMON_SOURCE.trimEnd(),
	)
		.replace("_e95_replace_timerCount", String(entries.length))
		.replace("_e95_replace_timerDefinitions", buildTimerDefinitions(entries))
		.replace(
			"_e95_replace_callbackInitializers",
			buildCallbackInitializers(entries),
		)
		.replace("_e95_replace_toneInitializers", buildToneInitializers(entries))
		.replace("_e95_replace_interruptHandlers", buildInterruptHandlers(entries))
		.replace("_e95_replace_getTimerCases", buildGetTimerCases(entries));
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["type", "gpio", "time"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
	generateSource,
};
