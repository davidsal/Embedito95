import { AST_NODE, INDENT } from "../constants.js";
import {
	ASYNC_STATUS_COMPLETED,
	ASYNC_STATUS_CONSUMED,
	INCOMPLETE_RETURN,
	INLINE_ASYNC_TIMERS,
	TASK_PARAMETER_NAME,
	TASK_STATE_VALUE_KEY,
	toAsyncTypeName,
	toChildFieldName,
	toChildReference,
	toChildStatusReference,
} from "./async-constants.js";
import {
	createStepBlock,
	renderExpression,
	renderStatement,
	setJumpTerminator,
} from "./async-step-machine.js";

const resolveChildName = (argument) => {
	if (argument?.callee?.type === AST_NODE.identifier) {
		return argument.callee.name;
	}
	return null;
};

const registerChild = (state, childName) => {
	if (!childName || state.childNames.includes(childName)) {
		return;
	}
	state.childNames.push(childName);
};

// Once the child's value has been read and the child marked CONSUMED the parent
// no longer needs the child task slot. Reset the optional child field to a null
// handle so the child `_AsyncTaskItem` can be reclaimed instead of being kept
// alive by the parent until the parent itself dies.
const releaseChild = (fieldName) => {
	return `${toChildReference(fieldName)} = null`;
};

// Renders the awaited call as a child: omitted trailing parameters with a
// default are filled in first, then the child flag is appended. Rendering it
// from the parts (instead of string-splicing) keeps a zero-arg call on a
// defaulted function (`await sleep()`) from shifting the flag into the first
// parameter.
const renderChildCall = (state, argument, childName) => {
	const params = state.asyncParams?.get(childName);
	const callee = renderExpression(state, argument.callee);
	const args = (argument.arguments ?? []).map((callArgument) => {
		return renderExpression(state, callArgument);
	});
	if (params) {
		for (let index = args.length; index < params.length; index++) {
			const defaultValue = params[index]?.defaultValue;
			args.push(defaultValue ? renderExpression(state, defaultValue) : "0");
		}
	}
	args.push("true");
	return `${callee}(${args.join(", ")})`;
};

// The inlined core timers keep their timer in two fields of the caller's task
// instead of spawning a child task: `<base>Milliseconds` and `<base>Start`,
// where `<base>` is `toChildFieldName(childName)` (so `sleep` uses
// `childSleepMilliseconds` / `childSleepStart`).
//
// One pair per inlined timer of a task is enough because the awaits in a task
// are SEQUENTIAL: each inline timer writes the duration and the start time,
// jumps to a step that returns until it elapses, and only then continues with
// the rest (including a second `await sleep` in the same expression). The two
// timers are never active in the same step, so the second write happens after
// the first wait is over. If concurrent awaits inside one task are ever added
// (an `await all`), each concurrently pending timer will need its own pair;
// today that case does not exist.
const inlineTimerFields = (childName) => {
	const base = toChildFieldName(childName);
	return {
		milliseconds: `${base}Milliseconds`,
		start: `${base}Start`,
	};
};

const inlineTimerFieldExists = (state, name) => {
	return state.inlineFields.some((field) => {
		return field.name === name;
	});
};

const registerInlineTimerFields = (state, fields) => {
	for (const name of [fields.milliseconds, fields.start]) {
		if (!inlineTimerFieldExists(state, name)) {
			state.inlineFields.push({ name, type: "u32" });
		}
	}
};

const isZeroLiteral = (node) => {
	return node?.type === AST_NODE.literal && node.value === 0;
};

// A zero (or omitted, defaulting to zero) duration needs no timer: the await
// becomes a plain yield, advancing to the next step and returning so the rest
// runs on the next tick.
const inlineDurationIsZero = (state, childName, duration) => {
	if (duration) {
		return isZeroLiteral(duration);
	}
	const params = state.asyncParams?.get(childName);
	const defaultValue = params?.[0]?.defaultValue;
	return !defaultValue || isZeroLiteral(defaultValue);
};

// `await sleep(ms)` with the core timer inlined: store the duration and the
// start time on the caller's task, then jump to a step that returns until it
// elapses. No child task, no queue slot. A zero duration is lowered to a plain
// yield (no timer fields, no clock reads). All the inline awaits of a task share
// the same pair of fields, which is correct because they run sequentially.
const lowerInlineTimer = (state, current, timerName, duration) => {
	if (inlineDurationIsZero(state, timerName, duration)) {
		const after = createStepBlock(state);
		setJumpTerminator(current, after.id);
		return after;
	}

	const { now, elapsed } = INLINE_ASYNC_TIMERS.get(timerName) ?? {
		now: "getMillis",
		elapsed: "hasElapsed",
	};

	const fields = inlineTimerFields(timerName);
	registerInlineTimerFields(state, fields);
	const { milliseconds, start } = fields;

	current.lines.push(
		`task.${milliseconds} = ${duration ? renderExpression(state, duration) : "0"}`,
	);
	current.lines.push(`task.${start} = ${now}()`);

	const check = createStepBlock(state);
	setJumpTerminator(current, check.id);
	check.lines.push(
		`if (!${elapsed}(task.${start}, task.${milliseconds})) {\n${INDENT}${INCOMPLETE_RETURN}\n}`,
	);

	const after = createStepBlock(state);
	setJumpTerminator(check, after.id);
	return after;
};

// `await sleep(ms)` leaves no payload: the core timer reports progress through
// the task state and its awaited value is `null`. Materialize that value as a
// plain null literal, not a cast to `AsyncTask`: a declaration whose value is
// never read drops the assignment, an argument accepts it through `T | null`,
// and a condition stays falsy instead of turning the empty task handle truthy.
const NULL_LITERAL_RAW = "null";

const makeInlineAwaitValue = (loc) => {
	return { type: AST_NODE.literal, value: null, raw: NULL_LITERAL_RAW, loc };
};

// Collects every await expression inside `node` in source order, so the
// lowering can inline all the timers of an expression whose value is discarded.
export const collectAwaitExpressions = (node, result = []) => {
	if (!node || typeof node !== "object") {
		return result;
	}
	if (node.type === AST_NODE.awaitExpression) {
		result.push(node);
		return result;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			collectAwaitExpressions(item, result);
		}
		return result;
	}
	for (const [property, value] of Object.entries(node)) {
		if (property === "loc") {
			continue;
		}
		collectAwaitExpressions(value, result);
	}
	return result;
};

// Resolves an await that can be inlined into the caller's task, returning the
// canonical timer and the duration expression of the call site, or null. Two
// shapes inline: a direct core timer (`await sleep(ms)`, with an import alias
// resolving through the module's `inlineTimers` map) and a wrapper whose whole
// body forwards its only parameter to one (`await wait(50)` where
// `wait = async (ms) => { await sleep(ms) }`), resolved through `inlineWrappers`.
// A wrapper call must pass exactly one argument; more than one cannot be
// forwarded unchanged, so it keeps the child-task lowering.
export const resolveInlineAwait = (state, awaitExpression) => {
	const argument = awaitExpression?.argument;
	const childName = resolveChildName(argument);
	if (!childName) {
		return null;
	}
	const timer = state.inlineTimers?.get(childName);
	if (timer) {
		return { timer, duration: argument.arguments?.[0] ?? null };
	}
	const wrapperTimer = state.inlineWrappers?.get(childName);
	if (!wrapperTimer) {
		return null;
	}
	const callArguments = argument.arguments ?? [];
	if (callArguments.length !== 1) {
		return null;
	}
	return { timer: wrapperTimer, duration: callArguments[0] };
};

// Inlines one timer await in place, returning the block that runs once the
// duration elapsed plus the expression that stands in for the awaited value.
export const lowerInlineAwaitNode = (
	state,
	current,
	awaitExpression,
	resolution,
) => {
	const after = lowerInlineTimer(
		state,
		current,
		resolution.timer,
		resolution.duration,
	);
	return { after, value: makeInlineAwaitValue(awaitExpression.loc) };
};

// Turns an awaited async call into a child task slot: create the child, then
// jump to a step that returns until the child reaches COMPLETED. `markConsumed`
// marks the child CONSUMED right there (a bare `await f()`, whose value is
// discarded); an expression `await` defers the marking until after its value is
// read, so CONSUMED always means "the parent is done with the child". Returns
// the block to continue in.
const startChild = (state, current, argument, childName, markConsumed) => {
	const fieldName = toChildFieldName(childName);
	registerChild(state, childName);

	current.lines.push(
		`${toChildReference(fieldName)} = ${renderChildCall(state, argument, childName)}`,
	);

	const check = createStepBlock(state);
	setJumpTerminator(current, check.id);
	check.lines.push(
		`if (${toChildStatusReference(fieldName)} != ${ASYNC_STATUS_COMPLETED}) {\n${INDENT}${INCOMPLETE_RETURN}\n}`,
	);
	if (markConsumed) {
		check.lines.push(
			`${toChildStatusReference(fieldName)} = ${ASYNC_STATUS_CONSUMED}`,
		);
		check.lines.push(releaseChild(fieldName));
	}

	const after = createStepBlock(state);
	setJumpTerminator(check, after.id);
	return { fieldName, after };
};

// `await f()` as its own statement: wait for the child, the value is discarded.
export const lowerAwaitStatement = (state, statement, current) => {
	const argument = statement.expression.argument;
	const resolution = resolveInlineAwait(state, statement.expression);
	if (resolution) {
		return lowerInlineTimer(
			state,
			current,
			resolution.timer,
			resolution.duration,
		);
	}

	const childName = resolveChildName(argument);
	if (!childName || !state.asyncFunctionNames?.has(childName)) {
		current.lines.push(renderExpression(state, argument));
		return current;
	}

	return startChild(state, current, argument, childName, true).after;
};

export const findAwaitExpression = (node, parent = null, key = null) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (node.type === AST_NODE.awaitExpression) {
		return { node, parent, key };
	}
	if (Array.isArray(node)) {
		for (let index = 0; index < node.length; index++) {
			const found = findAwaitExpression(node[index], node, index);
			if (found) {
				return found;
			}
		}
		return null;
	}
	for (const [property, value] of Object.entries(node)) {
		if (property === "loc") {
			continue;
		}
		const found = findAwaitExpression(value, node, property);
		if (found) {
			return found;
		}
	}
	return null;
};

const makeIdentifier = (name, loc) => {
	return { type: AST_NODE.identifier, name, loc };
};

const makeMember = (object, propertyName, loc) => {
	return {
		type: AST_NODE.memberExpression,
		object,
		property: makeIdentifier(propertyName, loc),
		computed: false,
		loc,
	};
};

// `(task.<child>.task as _<Child>AsyncTask).value`: cast the child's
// type-erased payload back to its task storage and read the return value the
// child handler stored there. The optional `child` slot and its optional `task`
// field unwrap automatically in the codegen.
const makeChildValueAccessor = (fieldName, taskTypeName, loc) => {
	const childSlot = makeMember(
		makeIdentifier(TASK_PARAMETER_NAME, loc),
		fieldName,
		loc,
	);
	const erased = makeMember(childSlot, TASK_PARAMETER_NAME, loc);
	const cast = {
		type: AST_NODE.asExpression,
		expression: erased,
		targetType: { name: taskTypeName, loc },
		loc,
	};
	const grouped = {
		type: AST_NODE.parenthesizedExpression,
		expression: cast,
		loc,
	};
	return makeMember(grouped, TASK_STATE_VALUE_KEY, loc);
};

// Lowers a statement whose await is not a bare statement (`x = await f()`,
// `g(await f())`, ...). An async callee becomes a child task slot plus a status
// check, and the await is replaced by the child's return value; an await on a
// plain sync function is a no-op, so its `await` is simply dropped. The inline
// timers take the same shortcut as a bare `await sleep(ms)`: no child task, the
// timer state lives on the caller's task and the await becomes its null value.
export const lowerExpressionAwait = (state, statement, current) => {
	const found = findAwaitExpression(statement);
	if (!found) {
		current.lines.push(renderStatement(state, statement));
		return current;
	}

	const argument = found.node.argument;
	const childName = resolveChildName(argument);
	const resolution = resolveInlineAwait(state, found.node);

	if (resolution) {
		const { after, value } = lowerInlineAwaitNode(
			state,
			current,
			found.node,
			resolution,
		);
		found.parent[found.key] = value;
		return lowerExpressionAwait(state, statement, after);
	}

	if (!childName || !state.asyncFunctionNames?.has(childName)) {
		found.parent[found.key] = argument;
		return lowerExpressionAwait(state, statement, current);
	}

	const { fieldName, after } = startChild(
		state,
		current,
		argument,
		childName,
		false,
	);
	found.parent[found.key] = makeChildValueAccessor(
		fieldName,
		toAsyncTypeName(childName),
		found.node.loc,
	);
	// The child is only fully consumed once its value has been read, so mark it
	// CONSUMED after the statement that uses the accessor (and only then can its
	// queue slot be reused).
	const end = lowerExpressionAwait(state, statement, after);
	end.lines.push(
		`${toChildStatusReference(fieldName)} = ${ASYNC_STATUS_CONSUMED}`,
	);
	end.lines.push(releaseChild(fieldName));
	return end;
};
