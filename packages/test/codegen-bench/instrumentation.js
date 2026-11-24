// Test-only instrumentation of the generated async event loop and sleep
// checks. The bench rewrites its TEMPORARY copy of the generated `.ino` and
// module sources before compiling them on the host; the production codegen and
// the snapshots never see any of this. Keeping the rewrite here (and pure)
// lets the unit checks pin the injection without building a project.
const EVENT_LOOP_MARKER = "_asyncEventLoop";
const WHILE_KEYWORD = "while (";
const SWITCH_KEYWORD = "switch (";
const QUEUE_ACCESS_MARKER = "TASK_QUEUE[";
const SLEEP_CHECK_MARKER = "core_time::hasElapsed(";
const BENCH_SLEEP_CHECK_NAME = "e95_bench_has_elapsed";

export const PASS_HOOK_CALL = "e95_bench_pass_start();";
export const VISIT_HOOK_CALL = "e95_bench_visit();";
export const DISPATCH_HOOK_CALL = "e95_bench_dispatch();";
export const COMPACTION_HOOK_CALL = "e95_bench_compaction();";
export const COMPACTION_VISIT_HOOK_CALL = "e95_bench_compact_visit();";

export const BENCH_HOOK_DECLARATIONS = `extern "C" void e95_bench_pass_start(void);
extern "C" void e95_bench_visit(void);
extern "C" void e95_bench_dispatch(void);
extern "C" void e95_bench_compaction(void);
extern "C" void e95_bench_compact_visit(void);
extern "C" int e95_bench_has_elapsed(unsigned long start_milliseconds, unsigned long elapsed_milliseconds);
`;

const findMatchingDelimiter = (
	source,
	openIndex,
	openCharacter,
	closeCharacter,
) => {
	let depth = 0;
	for (let index = openIndex; index < source.length; index += 1) {
		if (source[index] === openCharacter) {
			depth += 1;
		} else if (source[index] === closeCharacter) {
			depth -= 1;
			if (depth === 0) {
				return index;
			}
		}
	}
	return -1;
};

const findEventLoopBodyStart = (source) => {
	const markerIndex = source.indexOf(EVENT_LOOP_MARKER);
	if (markerIndex === -1) {
		return -1;
	}
	return source.indexOf("{", markerIndex);
};

const insertAt = (insertions, position, text) => {
	insertions.push({ position, text });
};

const collectDispatchInsertions = (
	body,
	bodyOffset,
	insertions,
	baseOffset,
) => {
	insertAt(insertions, baseOffset + bodyOffset + 1, VISIT_HOOK_CALL);
	let switchIndex = body.indexOf(SWITCH_KEYWORD);
	while (switchIndex !== -1) {
		insertAt(
			insertions,
			baseOffset + bodyOffset + switchIndex,
			`${DISPATCH_HOOK_CALL}\n`,
		);
		switchIndex = body.indexOf(
			SWITCH_KEYWORD,
			switchIndex + SWITCH_KEYWORD.length,
		);
	}
};

const collectCompactionInsertions = (bodyOffset, insertions, baseOffset) => {
	insertAt(insertions, baseOffset + bodyOffset + 1, COMPACTION_VISIT_HOOK_CALL);
};

// Inserts the visit/dispatch hooks inside the dispatch loops and the
// visit/compaction hooks inside the compaction loop. A queue loop that
// dispatches (contains a `switch`) is a dispatch loop; any other queue loop is
// the compaction scan, so a scheduler rewrite that keeps iterating the same
// queue stays measurable. A loop that contains other loops (the `while (true)`
// pass wrapper) is descended into instead of classified.
const collectLoopInsertions = (source, insertions, baseOffset) => {
	let searchIndex = 0;
	while (true) {
		const whileIndex = source.indexOf(WHILE_KEYWORD, searchIndex);
		if (whileIndex === -1) {
			return;
		}
		const conditionOpen = whileIndex + WHILE_KEYWORD.length - 1;
		const conditionClose = findMatchingDelimiter(
			source,
			conditionOpen,
			"(",
			")",
		);
		const bodyOpen = source.indexOf("{", conditionClose);
		const bodyClose = findMatchingDelimiter(source, bodyOpen, "{", "}");
		const loopBody = source.slice(bodyOpen, bodyClose);
		const bodyOffset = bodyOpen;
		if (loopBody.includes(WHILE_KEYWORD)) {
			collectLoopInsertions(loopBody, insertions, baseOffset + bodyOffset);
		} else if (loopBody.includes(SWITCH_KEYWORD)) {
			collectDispatchInsertions(loopBody, bodyOffset, insertions, baseOffset);
		} else if (loopBody.includes(QUEUE_ACCESS_MARKER)) {
			insertAt(
				insertions,
				baseOffset + whileIndex,
				`${COMPACTION_HOOK_CALL}\n`,
			);
			collectCompactionInsertions(bodyOffset, insertions, baseOffset);
		}
		searchIndex = bodyClose + 1;
	}
};

const findPassWrapperBodyStart = (body) => {
	const whileIndex = body.indexOf(WHILE_KEYWORD);
	if (whileIndex === -1) {
		return -1;
	}
	const conditionOpen = whileIndex + WHILE_KEYWORD.length - 1;
	const conditionClose = findMatchingDelimiter(body, conditionOpen, "(", ")");
	const bodyOpen = body.indexOf("{", conditionClose);
	return bodyOpen === -1 ? -1 : bodyOpen + 1;
};

const applyInsertions = (text, insertions) => {
	const ordered = [...insertions].sort((left, right) => {
		return right.position - left.position;
	});
	let result = text;
	for (const insertion of ordered) {
		result = `${result.slice(0, insertion.position)}${insertion.text}${result.slice(insertion.position)}`;
	}
	return result;
};

// Returns the source with the scheduler hooks injected, or `null` when the
// source does not hold the event loop (a module that only has handlers).
export const instrumentSchedulerSource = (source) => {
	const bodyStart = findEventLoopBodyStart(source);
	if (bodyStart === -1) {
		return null;
	}
	const bodyEnd = findMatchingDelimiter(source, bodyStart, "{", "}");
	if (bodyEnd === -1) {
		throw new Error("unbalanced event loop braces in the generated source");
	}
	const body = source.slice(bodyStart, bodyEnd);
	const passWrapperStart = findPassWrapperBodyStart(body);
	if (passWrapperStart === -1) {
		throw new Error("the event loop has no pass wrapper loop to instrument");
	}
	const insertions = [
		{ position: bodyStart + passWrapperStart, text: `\n${PASS_HOOK_CALL}` },
	];
	const bodyInsertions = [];
	collectLoopInsertions(body, bodyInsertions, 0);
	const rebased = bodyInsertions.map((insertion) => {
		return { position: bodyStart + insertion.position, text: insertion.text };
	});
	return applyInsertions(source, [...insertions, ...rebased]);
};

// The generated sleep check is `core_time::hasElapsed(start, duration)`. The
// bench keeps the exact same semantics but records how late the wake-up was.
export const instrumentSleepChecks = (source) => {
	return source.split(SLEEP_CHECK_MARKER).join(`${BENCH_SLEEP_CHECK_NAME}(`);
};

export const declareBenchHooks = (source) => {
	return `${BENCH_HOOK_DECLARATIONS}\n${source}`;
};
