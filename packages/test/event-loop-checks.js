// Unit checks for the generated async event loop, split in two groups:
//
// - CONTRACT (must survive any scheduler rewrite): task states, the single
//   timer pair, the read -> CONSUMED -> release order, child task creation,
//   the retained-item predicate and the fact that a reused slot is reset.
//   These are the semantics the runtime scenarios also exercise.
//
// - PRE-43 STRATEGY (expected to change in task 43): the concrete text of the
//   current implementation -- subset step 2, the catch-up pass, the
//   `iterationsSinceCompact >= 5` counter, `truncate`, and the linear
//   `reuseIndex` scan. They are flagged explicitly so the 43 scheduler rewrite
//   updates them deliberately instead of hitting false reds. Keep them only as
//   a description of today's optimization; assert new behaviour through the
//   observable scenarios in `codegen-run`.
//
// - 43b STRATEGY: compaction keeps a bounded number of CONSUMED slots as
//   reusable holes instead of dropping every one of them.
import {
	check,
	EVENT_LOOP_RETAINED_HOLE_LIMIT,
	parse,
	shared,
	tokenize,
} from "embedito95-core";
import { expectEqual } from "./reporting.js";

const ASYNC_SOURCE = [
	"import { sleep } from '@embedito95/async'",
	"const readValue = async (): i16 => {",
	"    return 1",
	"}",
	"const runTask = async () => {",
	"    const value = await readValue()",
	"    await sleep(16)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    runTask()",
	"}",
	"main()",
].join("\n");

const TASK_TYPE_NAME = "_RunTaskAsyncTask";
const CHILD_FIELD_NAME = "childReadValue";
const SLEEP_MILLISECONDS_FIELD = "childSleepMilliseconds";
const SLEEP_START_FIELD = "childSleepStart";

const buildIntermediateAsyncSource = (source, options = {}) => {
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens, source);
	// The snippet imports the async library without provisioning its sources:
	// the checker reports both the unknown library and the now-unused constant.
	// Both are expected here because this check only inspects the scheduler text
	// the intermediate generator emits, which does not depend on those sources.
	const { variableTypes } = check(ast, {
		isLibrary: false,
		comments,
		source,
		wordSize: 16,
	});
	// The generated intermediate is split in two: the task types/handlers stay
	// in the entry module and the shared queue/loop live in `async-task.e95`.
	// Join both so the checks can see the whole contract.
	const { main, async } = shared.buildAsyncIntermediate(
		source,
		[],
		{},
		variableTypes,
		null,
		options,
	);
	return `${main ?? ""}\n${async ?? ""}`;
};

const buildAsyncSource = () => {
	return buildIntermediateAsyncSource(ASYNC_SOURCE);
};

const buildIdleAsyncSource = () => {
	return buildIntermediateAsyncSource(ASYNC_SOURCE, { exitWhenIdle: true });
};

const findTaskTypeBody = (source, typeName) => {
	const start = source.indexOf(`type ${typeName} = {`);
	if (start === -1) {
		return "";
	}
	const end = source.indexOf("}", start);
	return end === -1 ? "" : source.slice(start, end);
};

const countOccurrences = (source, snippet) => {
	return source.split(snippet).length - 1;
};

const findFirstIndex = (source, snippet) => {
	return source.indexOf(snippet);
};

// PRE-43 STRATEGY: the current subset/catch-up rewrite. The scheduler rewrite
// is allowed to replace this with an equivalent that dispatches every runnable
// slot with bounded work per pass; update these checks then.
const checkPreStrategyDispatch = (source) => {
	return [
		expectEqual(
			"pre-43 strategy: event loop dispatches with subset step 2",
			source.includes("index = index + 2"),
			true,
		),
		expectEqual(
			"pre-43 strategy: event loop wraps the subset offset over 2 passes",
			source.includes("if (subsetOffset >= 2) {"),
			true,
		),
		expectEqual(
			"pre-43 strategy: event loop runs the catch-up pass with step 1",
			source.includes("const catchUpLimit = TASK_QUEUE.length()") &&
				source.includes("index = index + 1"),
			true,
		),
	];
};

// CONTRACT: compaction keeps every task that may still be observed (running,
// waiting on a child, or completed but not yet consumed).
const checkCompactionRetention = (source) => {
	return [
		expectEqual(
			"compaction retains running, running-child and completed tasks",
			source.includes("current.status == _AsyncTaskStatus.RUNNING") &&
				source.includes("current.status == _AsyncTaskStatus.RUNNING_CHILD") &&
				source.includes("current.status == _AsyncTaskStatus.COMPLETED"),
			true,
		),
	];
};

// PRE-43 STRATEGY: the periodic 5-pass compaction and its in-place rewrite.
// The rewrite may choose another trigger/scheme; the retention contract above
// and the runtime drain scenarios must still hold.
const checkPreStrategyCompaction = (source) => {
	return [
		expectEqual(
			"pre-43 strategy: event loop counts iterations since the last compaction",
			source.includes("iterationsSinceCompact = iterationsSinceCompact + 1"),
			true,
		),
		expectEqual(
			"pre-43 strategy: event loop compacts every 5 passes",
			source.includes("if (iterationsSinceCompact >= 5) {"),
			true,
		),
		expectEqual(
			"pre-43 strategy: event loop resets the compaction counter after compacting",
			source.includes("iterationsSinceCompact = 0"),
			true,
		),
		expectEqual(
			"pre-43 strategy: compaction trims the queue to the retained items",
			source.includes("TASK_QUEUE.truncate(writeIndex)"),
			true,
		),
	];
};

// 43b STRATEGY: compaction keeps a bounded number of CONSUMED slots as
// reusable holes (instead of all of them or none), so the linear scan in
// `_addAsyncTask` can reuse a slot without growing the queue.
const checkRetainedHoles = (source) => {
	return [
		expectEqual(
			"43b strategy: compaction counts the consumed holes it keeps",
			source.includes("let retainedHoles: u8 = 0"),
			true,
		),
		expectEqual(
			"43b strategy: compaction keeps consumed slots under a small limit",
			source.includes(
				`current.status == _AsyncTaskStatus.CONSUMED && retainedHoles < ${EVENT_LOOP_RETAINED_HOLE_LIMIT}`,
			),
			true,
		),
		expectEqual(
			"43b strategy: compaction increments the retained-hole counter",
			source.includes("retainedHoles += 1"),
			true,
		),
		expectEqual(
			"43b strategy: retained holes are compacted with the live tasks",
			source.includes("TASK_QUEUE[writeIndex] = current"),
			true,
		),
	];
};

// 43b STRATEGY: a retained CONSUMED hole is the only situation where a
// consumed payload would survive, so compaction drops it right where it keeps
// the slot. The handlers keep the cheaper inline path (no per-site payload
// release): reused slots are overwritten in `_addAsyncTask` and dropped slots
// are freed by `truncate`.
const checkConsumedPayloadRelease = (source) => {
	const compactPayloadRelease = "current.task = null";
	const retainedHoleIncrement = "retainedHoles += 1";
	return [
		expectEqual(
			"43b strategy: compaction drops the payload of a retained hole",
			source.includes(compactPayloadRelease),
			true,
		),
		expectEqual(
			"43b strategy: the retained-hole payload is dropped before counting it",
			source.indexOf(compactPayloadRelease) !== -1 &&
				source.indexOf(compactPayloadRelease) <
					source.indexOf(retainedHoleIncrement),
			true,
		),
		expectEqual(
			"43b strategy: a consumed top-level task does not drop its payload inline",
			source.includes("item.task = null"),
			false,
		),
		expectEqual(
			"43b strategy: releasing a child does not drop the child payload inline",
			source.includes(`task.${CHILD_FIELD_NAME}.task = null`),
			false,
		),
	];
};

// 43b STRATEGY: the idle exit fires on statuses, not on an empty queue. With
// hole retention the queue keeps up to two CONSUMED slots, so `length() == 0`
// would never be true again and the host loop would spin forever.
const checkIdleExitStatuses = (idleSource) => {
	return [
		expectEqual(
			"43b strategy: idle exit is guarded by the retained hole limit",
			idleSource.includes(
				`if (TASK_QUEUE.length() <= ${EVENT_LOOP_RETAINED_HOLE_LIMIT}) {`,
			),
			true,
		),
		expectEqual(
			"43b strategy: idle exit scans the queue with a compact index",
			idleSource.includes("let idleIndex: u16 = 0"),
			true,
		),
		expectEqual(
			"43b strategy: idle exit bounds its scan to the retained hole limit",
			idleSource.includes("while (idleIndex < TASK_QUEUE.length()) {"),
			true,
		),
		expectEqual(
			"43b strategy: idle exit counts the consumed entries it visits",
			idleSource.includes(
				"if (TASK_QUEUE[idleIndex].status == _AsyncTaskStatus.CONSUMED) {",
			) && idleSource.includes("idleConsumedCount += 1"),
			true,
		),
		expectEqual(
			"43b strategy: idle exit returns only when every entry is consumed",
			idleSource.includes("if (idleConsumedCount == TASK_QUEUE.length()) {"),
			true,
		),
		expectEqual(
			"43b strategy: idle exit no longer relies on an empty queue",
			idleSource.includes("if (TASK_QUEUE.length() == 0) {"),
			false,
		),
	];
};

// 43b STRATEGY: a source that does not exit on idle must not pay for the idle
// scan (and must not emit it at all).
const checkIdleExitIsOptIn = (source) => {
	return [
		expectEqual(
			"43b strategy: the default source does not scan for idle",
			source.includes("idleIndex"),
			false,
		),
		expectEqual(
			"43b strategy: the default source does not count consumed entries for idle",
			source.includes("idleConsumedCount"),
			false,
		),
	];
};

const checkSingleTimerPair = (source) => {
	const taskBody = findTaskTypeBody(source, TASK_TYPE_NAME);
	return [
		expectEqual(
			"task declares exactly one inline sleep duration field",
			countOccurrences(taskBody, `${SLEEP_MILLISECONDS_FIELD}: u32`),
			1,
		),
		expectEqual(
			"task declares exactly one inline sleep start field",
			countOccurrences(taskBody, `${SLEEP_START_FIELD}: u32`),
			1,
		),
		expectEqual(
			"task has no per-site suffixed sleep fields",
			/childSleep(?:Milliseconds|Start)\d+/.test(source),
			false,
		),
	];
};

const checkChildTaskCreation = (source) => {
	const taskBody = findTaskTypeBody(source, TASK_TYPE_NAME);
	return [
		expectEqual(
			"awaiting an async function reserves a child task slot",
			taskBody.includes(`${CHILD_FIELD_NAME}?: _AsyncTaskItem`),
			true,
		),
		expectEqual(
			"the child is spawned through its async-add wrapper",
			source.includes("task.childReadValue = _readValueAsyncAdd(true)"),
			true,
		),
	];
};

const checkReadBeforeConsume = (source) => {
	const readIndex = findFirstIndex(
		source,
		"task.value = (task.childReadValue.task as _ReadValueAsyncTask).value",
	);
	const consumedIndex = findFirstIndex(
		source,
		"task.childReadValue.status = _AsyncTaskStatus.CONSUMED",
	);
	const releaseIndex = findFirstIndex(source, "task.childReadValue = null");
	return [
		expectEqual("the awaited value is read", readIndex !== -1, true),
		expectEqual("the child is marked CONSUMED", consumedIndex !== -1, true),
		expectEqual(
			"the value is read before the child is marked CONSUMED",
			readIndex !== -1 && consumedIndex !== -1 && readIndex < consumedIndex,
			true,
		),
		expectEqual(
			"the child handle is released after it is consumed",
			consumedIndex !== -1 &&
				releaseIndex !== -1 &&
				consumedIndex < releaseIndex,
			true,
		),
	];
};

const checkTaskStates = (source) => {
	const statusEnumMatch = source.match(
		/export enum _AsyncTaskStatus \{([^}]*)\}/,
	);
	const statusMembers = (statusEnumMatch?.[1] ?? "").trim();
	return [
		expectEqual(
			"task status enum keeps RUNNING, RUNNING_CHILD, COMPLETED, CONSUMED",
			statusMembers,
			"RUNNING,\n    RUNNING_CHILD,\n    COMPLETED,\n    CONSUMED",
		),
		expectEqual(
			"a top-level task starts RUNNING and a child starts RUNNING_CHILD",
			source.includes(
				"status: isChild ? _AsyncTaskStatus.RUNNING_CHILD : _AsyncTaskStatus.RUNNING",
			),
			true,
		),
		expectEqual(
			"a child finishes as COMPLETED and a top-level task as CONSUMED",
			source.includes("if (item.status == _AsyncTaskStatus.RUNNING_CHILD) {") &&
				source.includes("item.status = _AsyncTaskStatus.COMPLETED") &&
				source.includes("item.status = _AsyncTaskStatus.CONSUMED"),
			true,
		),
	];
};

// CONTRACT: reusing a CONSUMED slot must reset it to a fresh status and step 0
// so no stale state leaks into the new task. The observable reuse behaviour is
// covered by the `codegen-run` reuse scenarios.
const checkReusedSlotReset = (source) => {
	return [
		expectEqual(
			"a reused slot is reset to a fresh status",
			source.includes(
				"TASK_QUEUE[reuseIndex].status = isChild ? _AsyncTaskStatus.RUNNING_CHILD : _AsyncTaskStatus.RUNNING",
			),
			true,
		),
		expectEqual(
			"a reused slot is reset to step 0",
			source.includes("TASK_QUEUE[reuseIndex].step = 0"),
			true,
		),
	];
};

// PRE-43 STRATEGY: `_addAsyncTask` scans the queue linearly for the first
// CONSUMED slot. The rewrite may keep a free list or an index hint instead.
const checkPreStrategyReuseScan = (source) => {
	return [
		expectEqual(
			"pre-43 strategy: the task queue scans for the first CONSUMED slot",
			source.includes(
				"if (TASK_QUEUE[reuseIndex].status == _AsyncTaskStatus.CONSUMED) {",
			),
			true,
		),
	];
};

export const runEventLoopChecks = () => {
	const source = buildAsyncSource();
	const idleSource = buildIdleAsyncSource();
	return [
		expectEqual("async intermediate is generated", source.length > 0, true),
		expectEqual(
			"the event loop is emitted into the intermediate module",
			source.includes(
				"export const _asyncEventLoop = (handlers: _AsyncHandlers) => {",
			),
			true,
		),
		// CONTRACT
		...checkCompactionRetention(source),
		...checkSingleTimerPair(source),
		...checkChildTaskCreation(source),
		...checkReadBeforeConsume(source),
		...checkTaskStates(source),
		...checkReusedSlotReset(source),
		// PRE-43 STRATEGY (update deliberately in task 43)
		...checkPreStrategyDispatch(source),
		...checkPreStrategyCompaction(source),
		...checkPreStrategyReuseScan(source),
		// 43b STRATEGY
		...checkRetainedHoles(source),
		...checkConsumedPayloadRelease(source),
		...checkIdleExitStatuses(idleSource),
		...checkIdleExitIsOptIn(source),
	];
};
