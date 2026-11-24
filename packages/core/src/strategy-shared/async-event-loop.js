import { AST_NODE, INDENT } from "../constants.js";
import { parseStatements, rebaseLines } from "./async-ast-utils.js";
import {
	ASYNC_ENUM_NAME,
	ASYNC_STATUS_COMPLETED,
	ASYNC_STATUS_CONSUMED,
	ASYNC_STATUS_RUNNING,
	ASYNC_STATUS_RUNNING_CHILD,
	ASYNC_TASK_ITEM_TYPE_NAME,
	COMPACT_HOLES_COUNT_NAME,
	COMPACT_ITEM_PARAMETER_NAME,
	COMPACT_WRITE_INDEX_NAME,
	EVENT_LOOP_CATCHUP_LIMIT_NAME,
	EVENT_LOOP_CATCHUP_STEP,
	EVENT_LOOP_COMPACT_INTERVAL,
	EVENT_LOOP_IDLE_CONSUMED_COUNT_NAME,
	EVENT_LOOP_IDLE_INDEX_NAME,
	EVENT_LOOP_INDEX_NAME,
	EVENT_LOOP_ITERATIONS_NAME,
	EVENT_LOOP_LIMIT_NAME,
	EVENT_LOOP_NAME,
	EVENT_LOOP_RETAINED_HOLE_LIMIT,
	EVENT_LOOP_SUBSET_OFFSET_NAME,
	EVENT_LOOP_SUBSET_STEP,
	HANDLERS_NAME,
	HANDLERS_TYPE_NAME,
	MAIN_FUNCTION_NAME,
	TASK_ITEM_PARAMETER_NAME,
	TASK_PARAMETER_NAME,
	TASK_QUEUE_GROWTH_STEP,
	TASK_QUEUE_LINE_OFFSET,
	TASK_QUEUE_MIN_CAPACITY,
	TASK_QUEUE_SHRINK_FACTOR,
	TASK_QUEUE_VARIABLE_NAME,
	TASK_STATUS_REFERENCE,
	toHandlerFunctionName,
	toHandlerPropertyName,
	toUpperSnakeCase,
} from "./async-constants.js";

const buildTaskQueueSource = () => {
	return `const ${TASK_QUEUE_VARIABLE_NAME}: ${ASYNC_TASK_ITEM_TYPE_NAME}[] = []\n`;
};

const DISPATCH_CASE_INDENT = INDENT.repeat(5);
const DISPATCH_BODY_INDENT = INDENT.repeat(6);
const DISPATCH_CLOSE_INDENT = INDENT.repeat(4);

const buildDispatchCase = (handle, isEntry) => {
	const memberName = toUpperSnakeCase(handle.name);
	const handlerName = isEntry
		? `${HANDLERS_NAME}.${toHandlerPropertyName(handle.name)}`
		: toHandlerFunctionName(handle.name);
	return `${DISPATCH_CASE_INDENT}case ${ASYNC_ENUM_NAME}.${memberName}:\n${DISPATCH_BODY_INDENT}${handlerName}(${TASK_ITEM_PARAMETER_NAME})\n${DISPATCH_BODY_INDENT}break`;
};

const buildDispatchSwitch = (handles, entryNames) => {
	const cases = handles
		.map((handle) => {
			return buildDispatchCase(handle, entryNames.has(handle.name));
		})
		.join("\n");
	return `switch (${TASK_ITEM_PARAMETER_NAME}.type) {\n${cases}\n${DISPATCH_CASE_INDENT}default:\n${DISPATCH_BODY_INDENT}break\n${DISPATCH_CLOSE_INDENT}}`;
};

const isRetainedReference = (itemName) => {
	return `(${itemName}.status == ${ASYNC_STATUS_RUNNING} || ${itemName}.status == ${ASYNC_STATUS_RUNNING_CHILD} || ${itemName}.status == ${ASYNC_STATUS_COMPLETED})`;
};

const isConsumedReference = (itemName) => {
	return `${itemName}.status == ${ASYNC_STATUS_CONSUMED}`;
};

// Compaction keeps every task that may still be observed plus a bounded number
// of CONSUMED slots (`retainedHoles`), so the next `_addAsyncTask` calls reuse
// a hole instead of growing the queue and reallocating its storage.
const buildCompactSource = (baseIndent) => {
	const writeIndex = COMPACT_WRITE_INDEX_NAME;
	const retainedHoles = COMPACT_HOLES_COUNT_NAME;
	const index = EVENT_LOOP_INDEX_NAME;
	const current = COMPACT_ITEM_PARAMETER_NAME;
	const indent1 = INDENT.repeat(baseIndent);
	const indent2 = INDENT.repeat(baseIndent + 1);
	const indent3 = INDENT.repeat(baseIndent + 2);
	const indent4 = INDENT.repeat(baseIndent + 3);
	const retainCondition = `(${isRetainedReference(current)} || (${isConsumedReference(current)} && ${retainedHoles} < ${EVENT_LOOP_RETAINED_HOLE_LIMIT}))`;
	return [
		`${indent1}${index} = 0`,
		`${indent1}let ${writeIndex}: u16 = 0`,
		`${indent1}let ${retainedHoles}: u8 = 0`,
		`${indent1}while (${index} < ${TASK_QUEUE_VARIABLE_NAME}.length()) {`,
		`${indent2}const ${current} = ${TASK_QUEUE_VARIABLE_NAME}[${index}]`,
		`${indent2}if ${retainCondition} {`,
		`${indent3}if ${isConsumedReference(current)} {`,
		// This is the only place a CONSUMED slot is kept, so clearing the
		// payload here guarantees no retained hole pins it: slots reused before
		// this point are overwritten in `_addAsyncTask`, and slots dropped here
		// are released by `truncate`. `current` is a shared handle, so the
		// mutation clears the item's payload in the queue.
		`${indent4}${current}.${TASK_PARAMETER_NAME} = null`,
		`${indent4}${retainedHoles} += 1`,
		`${indent3}}`,
		`${indent3}if (${writeIndex} != ${index}) {`,
		`${indent4}${TASK_QUEUE_VARIABLE_NAME}[${writeIndex}] = ${current}`,
		`${indent3}}`,
		`${indent3}${writeIndex} += 1`,
		`${indent2}}`,
		`${indent2}${index} = ${index} + 1`,
		`${indent1}}`,
		`${indent1}${TASK_QUEUE_VARIABLE_NAME}.truncate(${writeIndex})`,
		`${indent1}if (${TASK_QUEUE_VARIABLE_NAME}.length() * ${TASK_QUEUE_SHRINK_FACTOR} <= ${TASK_QUEUE_VARIABLE_NAME}.capacity() && ${TASK_QUEUE_VARIABLE_NAME}.capacity() > ${TASK_QUEUE_MIN_CAPACITY}) {`,
		`${indent2}const half = ${TASK_QUEUE_VARIABLE_NAME}.capacity() / ${TASK_QUEUE_SHRINK_FACTOR}`,
		`${indent2}const remainder = half % ${TASK_QUEUE_GROWTH_STEP}`,
		`${indent2}const target = remainder == 0 ? half : half + (${TASK_QUEUE_GROWTH_STEP} - remainder)`,
		`${indent2}${TASK_QUEUE_VARIABLE_NAME}.shrink(target)`,
		`${indent1}}`,
	].join("\n");
};

// One dispatch pass over the queue: snapshots the length, then visits the
// items with the given stride and dispatches the running ones.
const buildDispatchPass = (dispatch, limitName, increment) => {
	return [
		`${INDENT.repeat(2)}const ${limitName} = ${TASK_QUEUE_VARIABLE_NAME}.length()`,
		`${INDENT.repeat(2)}while (${EVENT_LOOP_INDEX_NAME} < ${limitName}) {`,
		`${INDENT.repeat(3)}const ${TASK_ITEM_PARAMETER_NAME} = ${TASK_QUEUE_VARIABLE_NAME}[${EVENT_LOOP_INDEX_NAME}]`,
		`${INDENT.repeat(3)}if (${TASK_STATUS_REFERENCE} == ${ASYNC_STATUS_RUNNING} || ${TASK_STATUS_REFERENCE} == ${ASYNC_STATUS_RUNNING_CHILD}) {`,
		`${INDENT.repeat(4)}${dispatch}`,
		`${INDENT.repeat(3)}}`,
		`${INDENT.repeat(3)}${EVENT_LOOP_INDEX_NAME} = ${EVENT_LOOP_INDEX_NAME} + ${increment}`,
		`${INDENT.repeat(2)}}`,
	];
};

// The loop is idle when no task is alive. With the bounded hole retention the
// queue keeps up to `EVENT_LOOP_RETAINED_HOLE_LIMIT` CONSUMED slots, so it may
// never reach zero length after a task ran: the check must look at the
// statuses instead. Only when every entry fits within the retained holes can
// all of them be CONSUMED; above that limit there is at least one live task
// (or the periodic compaction is about to trim the surplus holes), so the scan
// stays bounded by the hole limit and does not walk the whole queue.
const buildIdleExitSource = (exitWhenIdle) => {
	if (!exitWhenIdle) {
		return [];
	}
	const index = EVENT_LOOP_IDLE_INDEX_NAME;
	const consumedCount = EVENT_LOOP_IDLE_CONSUMED_COUNT_NAME;
	const indent1 = INDENT.repeat(2);
	const indent2 = INDENT.repeat(3);
	const indent3 = INDENT.repeat(4);
	const indent4 = INDENT.repeat(5);
	return [
		`${indent1}if (${TASK_QUEUE_VARIABLE_NAME}.length() <= ${EVENT_LOOP_RETAINED_HOLE_LIMIT}) {`,
		`${indent2}let ${index}: u16 = 0`,
		`${indent2}let ${consumedCount}: u8 = 0`,
		`${indent2}while (${index} < ${TASK_QUEUE_VARIABLE_NAME}.length()) {`,
		`${indent3}if (${TASK_QUEUE_VARIABLE_NAME}[${index}].status == ${ASYNC_STATUS_CONSUMED}) {`,
		`${indent4}${consumedCount} += 1`,
		`${indent3}}`,
		`${indent3}${index} += 1`,
		`${indent2}}`,
		`${indent2}if (${consumedCount} == ${TASK_QUEUE_VARIABLE_NAME}.length()) {`,
		`${indent3}return`,
		`${indent2}}`,
		`${indent1}}`,
	];
};

const buildEventLoopBody = (handles, entryNames, exitWhenIdle) => {
	const dispatch = buildDispatchSwitch(handles, entryNames);
	return [
		`${INDENT}let ${EVENT_LOOP_SUBSET_OFFSET_NAME}: i32 = 0`,
		`${INDENT}let ${EVENT_LOOP_ITERATIONS_NAME}: i32 = 0`,
		`${INDENT}while (true) {`,
		`${INDENT.repeat(2)}let ${EVENT_LOOP_INDEX_NAME}: i32 = ${EVENT_LOOP_SUBSET_OFFSET_NAME}`,
		...buildDispatchPass(
			dispatch,
			EVENT_LOOP_LIMIT_NAME,
			EVENT_LOOP_SUBSET_STEP,
		),
		// Catch-up: run the first step of the tasks spawned during this pass so
		// their timer starts in the same pass they were created (otherwise the
		// `limit` snapshot makes them wait a whole pass). Children spawned here
		// (grandchildren) stay past `catchUpLimit` and wait for the next pass,
		// which bounds the work per pass.
		`${INDENT.repeat(2)}${EVENT_LOOP_INDEX_NAME} = ${EVENT_LOOP_LIMIT_NAME}`,
		...buildDispatchPass(
			dispatch,
			EVENT_LOOP_CATCHUP_LIMIT_NAME,
			EVENT_LOOP_CATCHUP_STEP,
		),
		`${INDENT.repeat(2)}${EVENT_LOOP_SUBSET_OFFSET_NAME} = ${EVENT_LOOP_SUBSET_OFFSET_NAME} + 1`,
		`${INDENT.repeat(2)}if (${EVENT_LOOP_SUBSET_OFFSET_NAME} >= ${EVENT_LOOP_SUBSET_STEP}) {`,
		`${INDENT.repeat(3)}${EVENT_LOOP_SUBSET_OFFSET_NAME} = 0`,
		`${INDENT.repeat(2)}}`,
		// Compact periodically, not on queue growth: with slot reuse the queue
		// length stays flat, so a growth-based trigger would never fire and the
		// consumed slots would keep their payloads alive.
		`${INDENT.repeat(2)}${EVENT_LOOP_ITERATIONS_NAME} = ${EVENT_LOOP_ITERATIONS_NAME} + 1`,
		`${INDENT.repeat(2)}if (${EVENT_LOOP_ITERATIONS_NAME} >= ${EVENT_LOOP_COMPACT_INTERVAL}) {`,
		`${INDENT.repeat(3)}${EVENT_LOOP_ITERATIONS_NAME} = 0`,
		"",
		buildCompactSource(3),
		`${INDENT.repeat(2)}}`,
		...buildIdleExitSource(exitWhenIdle),
		`${INDENT}}`,
	].join("\n");
};

const buildEventLoopSource = (handles, entryNames, exitWhenIdle) => {
	const body = buildEventLoopBody(handles, entryNames, exitWhenIdle);
	return `const ${EVENT_LOOP_NAME} = (${HANDLERS_NAME}: ${HANDLERS_TYPE_NAME}) => {\n${body}\n}\n`;
};

const buildHandlersTypeSource = (entryHandles) => {
	const members = entryHandles
		.map((handle) => {
			const propertyName = toHandlerPropertyName(handle.name);
			return `${INDENT}${propertyName}: (${TASK_ITEM_PARAMETER_NAME}: ${ASYNC_TASK_ITEM_TYPE_NAME}) => void`;
		})
		.join("\n");
	return `export type ${HANDLERS_TYPE_NAME} = {\n${members}\n}\n`;
};

const buildHandlersObjectSource = (entryHandles) => {
	const properties = entryHandles
		.map((handle) => {
			const handleName = toHandlerFunctionName(handle.name);
			return `${INDENT}${toHandlerPropertyName(handle.name)}: ${handleName}`;
		})
		.join(",\n");
	return `{\n${properties}\n}`;
};

const buildEventLoopCallSource = (entryHandles) => {
	return `const ${HANDLERS_NAME}: ${HANDLERS_TYPE_NAME} = ${buildHandlersObjectSource(entryHandles)}\n${EVENT_LOOP_NAME}(${HANDLERS_NAME})\n`;
};

export const injectTaskQueue = (ast, handles, sourceLineCount, insertIndex) => {
	if (handles.length === 0) {
		return [];
	}
	const nodes = parseStatements(buildTaskQueueSource(handles));
	rebaseLines(nodes, sourceLineCount + TASK_QUEUE_LINE_OFFSET);
	ast.body.splice(insertIndex, 0, ...nodes);
	return nodes;
};

const findMainDeclaration = (ast) => {
	return ast.body.find((statement) => {
		return (
			statement.type === AST_NODE.variableDeclaration &&
			statement.declarations?.[0]?.id?.name === MAIN_FUNCTION_NAME
		);
	});
};

const findLastTypeDeclarationIndex = (ast) => {
	let index = -1;

	for (const [position, statement] of ast.body.entries()) {
		if (statement.type === AST_NODE.typeDeclaration) {
			index = position;
		}
	}

	return index;
};

const appendEventLoopCall = (mainDeclaration, callStatements) => {
	const mainBody = mainDeclaration?.declarations?.[0]?.init?.body;

	if (mainBody?.type === AST_NODE.blockStatement) {
		mainBody.body.push(...callStatements);
	}
};

const insertEventLoopNode = (ast, eventLoop) => {
	const mainIndex = ast.body.indexOf(findMainDeclaration(ast));

	if (mainIndex === -1) {
		ast.body.push(eventLoop);
		return;
	}

	ast.body.splice(mainIndex, 0, eventLoop);
};

const insertHandlersTypeNode = (ast, handlersType) => {
	const typeIndex = findLastTypeDeclarationIndex(ast);

	if (typeIndex === -1) {
		ast.body.push(handlersType);
		return;
	}

	ast.body.splice(typeIndex + 1, 0, handlersType);
};

export const injectEventLoop = (
	ast,
	entryHandles,
	libraryHandles,
	options = {},
) => {
	const { exitWhenIdle = false } = options;
	const handles = [...entryHandles, ...libraryHandles];
	const entryNames = new Set(
		entryHandles.map((handle) => {
			return handle.name;
		}),
	);
	const [eventLoop] = parseStatements(
		buildEventLoopSource(handles, entryNames, exitWhenIdle),
	);
	const [handlersType] = parseStatements(buildHandlersTypeSource(entryHandles));
	const callStatements = parseStatements(
		buildEventLoopCallSource(entryHandles),
	);
	const mainDeclaration = findMainDeclaration(ast);

	appendEventLoopCall(mainDeclaration, callStatements);
	insertEventLoopNode(ast, eventLoop);
	insertHandlersTypeNode(ast, handlersType);

	return [handlersType, eventLoop];
};
