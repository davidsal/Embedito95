import { INDENT } from "../constants.js";
import { format } from "../formatter/index.js";
import {
	ADD_TASK_FUNCTION_NAME,
	COMPACT_WRITE_INDEX_NAME,
	EVENT_LOOP_INDEX_NAME,
	EVENT_LOOP_SPACING_PATTERN,
	TASK_ITEM_PARAMETER_NAME,
	TASK_PARAMETER_NAME,
	TASK_QUEUE_MIN_CAPACITY,
	TASK_QUEUE_SHRINK_FACTOR,
	TASK_QUEUE_VARIABLE_NAME,
} from "./async-constants.js";

export const normalizeTopLevelSpacing = (text) => {
	return text
		.replace(EVENT_LOOP_SPACING_PATTERN, "$1\n\n$2")
		.replace(
			new RegExp(`^(const ${TASK_QUEUE_VARIABLE_NAME}\\b[^\\n]*)\\n`, "m"),
			"$1\n\n",
		)
		.replace(/^}\n(export\s+)?(const\b)/gm, "}\n\n$1$2")
		.replace(/^}\n(export\s+)?(type\b|enum\b)/gm, "}\n\n$1$2")
		.replace(/^}\n([A-Za-z_$][\w$]*\()/gm, "}\n\n$1");
};

const normalizeAddTaskSpacing = (text) => {
	const closingBrace = `${INDENT}}`;
	const neededLine = `${INDENT}const needed = ${TASK_QUEUE_VARIABLE_NAME}.length() + 1`;
	const pushLine = `${INDENT}${TASK_QUEUE_VARIABLE_NAME}.push(${TASK_ITEM_PARAMETER_NAME})`;
	const returnLine = `${INDENT}return ${TASK_ITEM_PARAMETER_NAME}`;
	const wrapperReturn = `${INDENT}return ${ADD_TASK_FUNCTION_NAME}(`;
	return text
		.replace(
			`${closingBrace}\n${neededLine}`,
			`${closingBrace}\n\n${neededLine}`,
		)
		.replace(`${closingBrace}\n${pushLine}`, `${closingBrace}\n\n${pushLine}`)
		.replace(`${pushLine}\n${returnLine}`, `${pushLine}\n\n${returnLine}`)
		.replaceAll(
			`${closingBrace}\n${wrapperReturn}`,
			`${closingBrace}\n\n${wrapperReturn}`,
		);
};

const normalizeEventLoopSpacing = (text) => {
	const close = `${INDENT.repeat(2)}}`;
	const indexReset = `${INDENT.repeat(2)}${EVENT_LOOP_INDEX_NAME} = 0`;
	const truncateLine = `${INDENT.repeat(2)}${TASK_QUEUE_VARIABLE_NAME}.truncate(${COMPACT_WRITE_INDEX_NAME})`;
	const shrinkIf = `${INDENT.repeat(2)}if (${TASK_QUEUE_VARIABLE_NAME}.length() * ${TASK_QUEUE_SHRINK_FACTOR} <= ${TASK_QUEUE_VARIABLE_NAME}.capacity() && ${TASK_QUEUE_VARIABLE_NAME}.capacity() > ${TASK_QUEUE_MIN_CAPACITY}) {`;
	return text
		.replaceAll(`${close}\n${indexReset}`, `${close}\n\n${indexReset}`)
		.replace(`${close}\n${truncateLine}`, `${close}\n\n${truncateLine}`)
		.replace(`${truncateLine}\n${shrinkIf}`, `${truncateLine}\n\n${shrinkIf}`);
};

const normalizeHandleSpacing = (text) => {
	const handleCastPattern = new RegExp(
		`(${INDENT}const ${TASK_PARAMETER_NAME} = ${TASK_ITEM_PARAMETER_NAME}\\.${TASK_PARAMETER_NAME} as [A-Za-z0-9_$]+)\\n(${INDENT}switch \\()`,
		"g",
	);
	return text.replace(handleCastPattern, "$1\n\n$2");
};

export const formatMainIntermediate = (program, source) => {
	return normalizeHandleSpacing(
		normalizeTopLevelSpacing(format(program, [], source)),
	);
};

export const formatAsyncIntermediate = (program, comments, source) => {
	return normalizeHandleSpacing(
		normalizeEventLoopSpacing(
			normalizeAddTaskSpacing(
				normalizeTopLevelSpacing(format(program, comments, source)),
			),
		),
	);
};
