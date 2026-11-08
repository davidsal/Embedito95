import { INDENT } from "../constants.js";

export const EVENT_LOOP_NAME = "_asyncEventLoop";
export const TASK_QUEUE_VARIABLE_NAME = "TASK_QUEUE";
export const TASK_QUEUE_GROWTH_STEP = 5;
export const TASK_QUEUE_MIN_CAPACITY = 5;
export const TASK_QUEUE_SHRINK_FACTOR = 2;
export const MAIN_FUNCTION_NAME = "main";
export const ASYNC_HANDLER_SUFFIX = "AsyncHandler";
export const ASYNC_ADD_SUFFIX = "AsyncAdd";
export const ADD_TASK_FUNCTION_NAME = "_addAsyncTask";
export const ASYNC_TYPE_SUFFIX = "AsyncTask";
export const ASYNC_ENUM_NAME = "_AsyncTask";
export const ASYNC_ENUM_NONE_MEMBER = "NONE";
export const ASYNC_STATUS_ENUM_NAME = "_AsyncTaskStatus";
export const ASYNC_STATUS_MEMBER_NAMES = [
	"RUNNING",
	"RUNNING_CHILD",
	"COMPLETED",
	"CONSUMED",
];
export const ASYNC_TASK_ITEM_TYPE_NAME = "_AsyncTaskItem";
export const TASK_PARAMETER_NAME = "task";
export const TASK_ITEM_PARAMETER_NAME = "item";
export const TASK_CHILD_PARAMETER_NAME = "isChild";
export const HANDLERS_NAME = "handlers";
export const HANDLERS_TYPE_NAME = "_AsyncHandlers";
export const EVENT_LOOP_INDEX_NAME = "index";
export const EVENT_LOOP_LIMIT_NAME = "limit";
export const EVENT_LOOP_SUBSET_OFFSET_NAME = "subsetOffset";
export const EVENT_LOOP_SUBSET_STEP = 2;
export const EVENT_LOOP_CATCHUP_LIMIT_NAME = "catchUpLimit";
export const EVENT_LOOP_CATCHUP_STEP = 1;
export const EVENT_LOOP_ITERATIONS_NAME = "iterationsSinceCompact";
export const EVENT_LOOP_COMPACT_INTERVAL = 5;
export const COMPACT_WRITE_INDEX_NAME = "writeIndex";
export const COMPACT_ITEM_PARAMETER_NAME = "current";
export const CHILD_FIELD_PREFIX = "child";
export const STEP_REFERENCE = `${TASK_ITEM_PARAMETER_NAME}.step`;
export const TASK_STATUS_REFERENCE = `${TASK_ITEM_PARAMETER_NAME}.status`;
export const ASYNC_STATUS_RUNNING = `${ASYNC_STATUS_ENUM_NAME}.RUNNING`;
export const ASYNC_STATUS_RUNNING_CHILD = `${ASYNC_STATUS_ENUM_NAME}.RUNNING_CHILD`;
export const ASYNC_STATUS_COMPLETED = `${ASYNC_STATUS_ENUM_NAME}.COMPLETED`;
export const ASYNC_STATUS_CONSUMED = `${ASYNC_STATUS_ENUM_NAME}.CONSUMED`;
export const INCOMPLETE_RETURN = "return";
export const COMPLETE_RETURN = `if (${TASK_STATUS_REFERENCE} == ${ASYNC_STATUS_RUNNING_CHILD}) {\n${INDENT}${TASK_STATUS_REFERENCE} = ${ASYNC_STATUS_COMPLETED}\n} else {\n${INDENT}${TASK_STATUS_REFERENCE} = ${ASYNC_STATUS_CONSUMED}\n}`;
export const DEFAULT_LOCAL_TYPE = "i32";
export const UNUSED_TASK_FIELD_NAME = "_unused";
export const TERMINATOR_JUMP = "jump";
export const TERMINATOR_BRANCH = "branch";
export const TASK_STATE_COMPLETED_KEY = "completed";
export const TASK_STATE_VALUE_KEY = "value";
export const SYNTHESIZED_LINE_OFFSET = 10;
export const SYNTHESIZED_STRIDE = 1000;
export const SYNTHESIZED_WRAPPER_GAP = 500;
export const ADD_TASK_LINE_OFFSET = 90000;
export const ASYNC_TYPE_LINE_OFFSET = 100000;
export const ASYNC_ENUM_LINE_OFFSET = 150000;
export const ASYNC_STATUS_ENUM_LINE_OFFSET = 155000;
export const ASYNC_TASK_ITEM_LINE_OFFSET = 160000;
export const TASK_QUEUE_LINE_OFFSET = 200000;
// Async library functions whose `await` is inlined into the caller's task
// instead of spawning a child task (the core timers: `await sleep(ms)` stores
// its state on the caller). Each entry maps the function to the clock and
// elapsed helpers it uses, so `sleep` (milliseconds) and `sleepMicros`
// (microseconds) pick the right ones.
export const INLINE_ASYNC_TIMERS = new Map([
	["sleep", { now: "getMillis", elapsed: "hasElapsed" }],
	["sleepMicros", { now: "getMicros", elapsed: "hasElapsedMicros" }],
]);
export const INLINE_ASYNC_FUNCTION_NAMES = new Set(INLINE_ASYNC_TIMERS.keys());
export const ASYNC_INTERMEDIATE_FILE_NAME = "async-task.e95";
export const ASYNC_INTERMEDIATE_IMPORT_SOURCE = `./${ASYNC_INTERMEDIATE_FILE_NAME}`;
export const EVENT_LOOP_SPACING_PATTERN = new RegExp(
	`([^\\n])\\n(const ${EVENT_LOOP_NAME}\\b)`,
);

export const capitalizeFirst = (name) => {
	return name.charAt(0).toUpperCase() + name.slice(1);
};

export const toChildFieldName = (name) => {
	if (!name) {
		return CHILD_FIELD_PREFIX;
	}
	return `${CHILD_FIELD_PREFIX}${capitalizeFirst(name)}`;
};

export const toChildReference = (fieldName) => {
	return `${TASK_PARAMETER_NAME}.${fieldName}`;
};

export const toChildStatusReference = (fieldName) => {
	return `${toChildReference(fieldName)}.status`;
};

export const toAsyncTypeName = (name) => {
	return `_${capitalizeFirst(name)}${ASYNC_TYPE_SUFFIX}`;
};

export const toHandlerFunctionName = (name) => {
	return `_${name}${ASYNC_HANDLER_SUFFIX}`;
};

export const toHandlerPropertyName = (name) => {
	return `${name}${ASYNC_HANDLER_SUFFIX}`;
};

export const toUpperSnakeCase = (name) => {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.toUpperCase();
};
