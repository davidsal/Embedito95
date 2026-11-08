import { walk } from "../checker/index.js";
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

// The inlined core `sleep` keeps its timer in two fields of the caller's task
// instead of spawning a child task: `<childSleep>Milliseconds` and
// `<childSleep>Start`. When a function awaits `sleep` more than once the fields
// cannot be shared, so each site gets a numeric suffix (…Milliseconds1,
// …Milliseconds2, …).
export const countInlineAwaitSites = (node, inlineAsyncNames) => {
	if (!inlineAsyncNames || inlineAsyncNames.size === 0) {
		return 0;
	}

	let count = 0;

	walk(node, {
		enter: (value) => {
			if (value.type === AST_NODE.functionExpression) {
				return false;
			}
			if (
				value.type === AST_NODE.expressionStatement &&
				value.expression?.type === AST_NODE.awaitExpression &&
				value.expression.argument?.type === AST_NODE.callExpression &&
				value.expression.argument.callee?.type === AST_NODE.identifier &&
				inlineAsyncNames.has(value.expression.argument.callee.name)
			) {
				count += 1;
			}
			return undefined;
		},
	});

	return count;
};

const inlineTimerFields = (state, childName) => {
	const base = toChildFieldName(childName);
	const suffix = state.inlineSiteCount > 1 ? `${state.inlineIndex}` : "";
	return {
		milliseconds: `${base}Milliseconds${suffix}`,
		start: `${base}Start${suffix}`,
	};
};

const isZeroLiteral = (node) => {
	return node?.type === AST_NODE.literal && node.value === 0;
};

// A zero (or omitted, defaulting to zero) duration needs no timer: the await
// becomes a plain yield, advancing to the next step and returning so the rest
// runs on the next tick.
const inlineDurationIsZero = (state, argument, childName) => {
	const provided = argument.arguments?.[0];
	if (provided) {
		return isZeroLiteral(provided);
	}
	const params = state.asyncParams?.get(childName);
	const defaultValue = params?.[0]?.defaultValue;
	return !defaultValue || isZeroLiteral(defaultValue);
};

// `await sleep(ms)` with the core timer inlined: store the duration and the
// start time on the caller's task, then jump to a step that returns until it
// elapses. No child task, no queue slot. A zero duration is lowered to a plain
// yield (no timer fields, no clock reads).
const lowerInlineTimer = (state, current, argument, childName) => {
	if (inlineDurationIsZero(state, argument, childName)) {
		const after = createStepBlock(state);
		setJumpTerminator(current, after.id);
		return after;
	}

	const { now, elapsed } = INLINE_ASYNC_TIMERS.get(childName) ?? {
		now: "getMillis",
		elapsed: "hasElapsed",
	};

	state.inlineIndex += 1;
	const { milliseconds, start } = inlineTimerFields(state, childName);
	state.inlineFields.push({ name: milliseconds, type: "u32" });
	state.inlineFields.push({ name: start, type: "u32" });

	const duration = argument.arguments?.[0];
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
	}

	const after = createStepBlock(state);
	setJumpTerminator(check, after.id);
	return { fieldName, after };
};

// `await f()` as its own statement: wait for the child, the value is discarded.
export const lowerAwaitStatement = (state, statement, current) => {
	const argument = statement.expression.argument;
	const childName = resolveChildName(argument);

	if (!childName || !state.asyncFunctionNames?.has(childName)) {
		current.lines.push(renderExpression(state, argument));
		return current;
	}

	if (state.inlineAsyncNames?.has(childName)) {
		return lowerInlineTimer(state, current, argument, childName);
	}

	return startChild(state, current, argument, childName, true).after;
};

const findAwait = (node, parent = null, key = null) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (node.type === AST_NODE.awaitExpression) {
		return { node, parent, key };
	}
	if (Array.isArray(node)) {
		for (let index = 0; index < node.length; index++) {
			const found = findAwait(node[index], node, index);
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
		const found = findAwait(value, node, property);
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
// plain sync function is a no-op, so its `await` is simply dropped.
export const lowerExpressionAwait = (state, statement, current) => {
	const found = findAwait(statement);
	if (!found) {
		current.lines.push(renderStatement(state, statement));
		return current;
	}

	const argument = found.node.argument;
	const childName = resolveChildName(argument);

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
	return end;
};
