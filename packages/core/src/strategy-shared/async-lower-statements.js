import { AST_NODE } from "../constants.js";
import {
	COMPLETE_RETURN,
	INCOMPLETE_RETURN,
	TASK_PARAMETER_NAME,
} from "./async-constants.js";
import {
	collectAwaitExpressions,
	findAwaitExpression,
	lowerAwaitStatement,
	lowerExpressionAwait,
	lowerInlineAwaitNode,
	resolveInlineAwait,
} from "./async-lower-await.js";
import {
	containsAwait,
	createStepBlock,
	forkBlock,
	isBareAwaitStatement,
	isLiteralTrue,
	renderExpression,
	renderStatement,
	setBranchTerminator,
	setJumpTerminator,
} from "./async-step-machine.js";
import {
	containsIncompleteReturn,
	getTaskStateValue,
	isCompleteOnlyLiteral,
	isIncompleteReturn,
	stripIncompleteReturns,
} from "./async-task-state.js";

// A parenthesized tree around the awaited value (`return (await sleep(ms))`) is
// still exactly the await for the purposes of the "no payload" shortcut.
const unwrapParentheses = (node) => {
	let current = node;
	while (current?.type === AST_NODE.parenthesizedExpression) {
		current = current.expression;
	}
	return current;
};

// True only when `node` is EXACTLY an inline timer await (parentheses aside).
// Any other operand (`consume(await sleep(ms))`, `(await sleep(ms)) == null`,
// `foo() + await sleep(ms)`) makes the expression carry extra effects/value, so
// it cannot be dropped or treated as a payload-less return.
const isPureInlineAwait = (state, node) => {
	const inner = unwrapParentheses(node);
	return Boolean(
		inner?.type === AST_NODE.awaitExpression &&
			resolveInlineAwait(state, inner),
	);
};

// Lowers every inline timer await of `container[key]` in source order,
// replacing each with its null value, and returns the block to continue in.
// Returns null when the expression has no await or any await is not an inline
// timer, so the caller keeps its block untouched.
const lowerAllInlineAwaits = (state, container, key, current) => {
	const awaits = collectAwaitExpressions(container[key]);
	if (awaits.length === 0) {
		return null;
	}
	const inlineResolutions = awaits.map((awaitExpression) => {
		return resolveInlineAwait(state, awaitExpression);
	});
	if (inlineResolutions.some((resolution) => !resolution)) {
		return null;
	}
	let block = current;
	for (let index = 0; index < awaits.length; index++) {
		const found = findAwaitExpression(container[key]);
		const { after, value } = lowerInlineAwaitNode(
			state,
			block,
			found.node,
			inlineResolutions[index],
		);
		if (found.parent) {
			found.parent[found.key] = value;
		} else {
			container[key] = value;
		}
		block = after;
	}
	return block;
};

// `const t = await sleep(ms)` where `t` is never read hoists to
// `task.t = <await>` plus a `t` field. The stored value is dead, but the timer
// is an observable effect: lower every inline timer await of the initializer as
// a bare statement and drop the assignment (and, once all its writes are like
// this, the task field). Keeps the C++ valid without declaring an unread field.
// An initializer that is MORE than the timer (`consume(await sleep(ms))`) keeps
// the assignment so the surrounding call and its effects are not lost.
const lowerUnusedHoistedAwait = (state, statement, current) => {
	const assignment = statement.expression;
	if (
		statement.type !== AST_NODE.expressionStatement ||
		assignment?.type !== AST_NODE.assignmentExpression ||
		assignment.operator !== "="
	) {
		return null;
	}
	const left = assignment.left;
	if (
		left?.type !== AST_NODE.memberExpression ||
		left.computed ||
		left.object?.type !== AST_NODE.identifier ||
		left.object.name !== TASK_PARAMETER_NAME ||
		left.property?.type !== AST_NODE.identifier
	) {
		return null;
	}
	const name = left.property.name;
	if (!state.unusedAssignmentCounts?.has(name)) {
		return null;
	}
	const pureInlineAwait = isPureInlineAwait(state, assignment.right);
	const block = lowerAllInlineAwaits(
		state,
		statement.expression,
		"right",
		current,
	);
	if (!block) {
		return null;
	}
	if (!pureInlineAwait) {
		block.lines.push(renderStatement(state, statement));
		return block;
	}
	const remaining = (state.unusedAssignmentCounts.get(name) ?? 0) - 1;
	state.unusedAssignmentCounts.set(name, remaining);
	if (remaining === 0) {
		state.droppedFieldNames.add(name);
	}
	return block;
};

export const lowerSequence = (state, statements, current) => {
	if (statements.length === 0) {
		return current;
	}
	const next = lowerStatement(state, statements[0], current);
	if (!next) {
		return null;
	}
	return lowerSequence(state, statements.slice(1), next);
};

export const lowerBlock = (state, blockStatement, current) => {
	return lowerSequence(state, blockStatement.body, current);
};

const lowerAlternate = (state, alternate, current) => {
	if (alternate.type === AST_NODE.blockStatement) {
		return lowerBlock(state, alternate, current);
	}
	return lowerStatement(state, alternate, current);
};

const lowerReturnStatement = (state, statement, current) => {
	const returnAwait = findAwaitExpression(statement.argument);
	const inlineTimerAwait = Boolean(
		returnAwait && resolveInlineAwait(state, returnAwait.node),
	);
	const pureInlineAwait =
		inlineTimerAwait && isPureInlineAwait(state, statement.argument);
	const awaitBlock = inlineTimerAwait
		? lowerAllInlineAwaits(state, statement, "argument", current)
		: null;
	const block = awaitBlock ?? current;
	if (isIncompleteReturn(statement)) {
		block.lines.push(INCOMPLETE_RETURN);
		return null;
	}
	if (isCompleteOnlyLiteral(statement.argument)) {
		block.lines.push(COMPLETE_RETURN);
		return null;
	}
	// `return await sleep(ms)` has no payload. Completing the task is enough:
	// storing the null value would assign a nullable literal into the `value`
	// field, whose type comes from the declared return and is not nullable.
	// A return that is MORE than the timer (`return consume(await sleep(ms))`)
	// keeps its expression (with the await replaced by its null value) so the
	// surrounding call, comparison or operands are not lost.
	if (pureInlineAwait) {
		block.lines.push(COMPLETE_RETURN);
		return null;
	}
	const value = getTaskStateValue(statement.argument);
	block.lines.push(COMPLETE_RETURN);
	if (value) {
		state.hasReturnValue = true;
		block.lines.push(`task.value = ${renderExpression(state, value)}`);
	}
	return null;
};

// Inlines a timer await found anywhere inside `container[key]` (a condition, a
// return value, ...): the timer setup runs in `current`, then the caller
// continues in the returned block with the await replaced by its materialized
// value. Returns null when the expression has no inline-timer await, so the
// caller keeps its current block.
const lowerInlineAwaitInExpression = (state, container, key, current) => {
	const found = findAwaitExpression(container[key]);
	if (!found) {
		return null;
	}
	const resolution = resolveInlineAwait(state, found.node);
	if (!resolution) {
		return null;
	}
	const { after, value } = lowerInlineAwaitNode(
		state,
		current,
		found.node,
		resolution,
	);
	if (found.parent) {
		found.parent[found.key] = value;
	} else {
		container[key] = value;
	}
	return after;
};

const lowerIfStatement = (state, statement, current) => {
	const consequentEntry = createStepBlock(state);
	const alternateEntry = statement.alternate ? createStepBlock(state) : null;
	const after = createStepBlock(state);
	const testBlock =
		lowerInlineAwaitInExpression(state, statement, "test", current) ?? current;

	setBranchTerminator(
		testBlock,
		renderExpression(state, statement.test),
		consequentEntry.id,
		alternateEntry ? alternateEntry.id : after.id,
	);

	const consequentExit = lowerBlock(
		state,
		statement.consequent,
		consequentEntry,
	);
	if (consequentExit) {
		setJumpTerminator(consequentExit, after.id);
	}

	if (alternateEntry) {
		const alternateExit = lowerAlternate(
			state,
			statement.alternate,
			alternateEntry,
		);
		if (alternateExit) {
			setJumpTerminator(alternateExit, after.id);
		}
	}

	return after;
};

const lowerInfiniteLoop = (state, statement, current) => {
	const body = forkBlock(state, current);
	const bodyExit = lowerBlock(state, statement.body, body);

	if (bodyExit) {
		setJumpTerminator(bodyExit, body.id);
	}

	return null;
};

const lowerWhileStatement = (state, statement, current) => {
	if (isLiteralTrue(statement.test)) {
		return lowerInfiniteLoop(state, statement, current);
	}

	const test = forkBlock(state, current);
	const body = createStepBlock(state);
	const after = createStepBlock(state);
	const testBlock =
		lowerInlineAwaitInExpression(state, statement, "test", test) ?? test;

	setBranchTerminator(
		testBlock,
		renderExpression(state, statement.test),
		body.id,
		after.id,
	);

	const bodyExit = lowerBlock(state, statement.body, body);
	if (bodyExit) {
		setJumpTerminator(bodyExit, test.id);
	}

	return after;
};

const lowerForStatement = (state, statement, current) => {
	if (statement.init) {
		current.lines.push(
			statement.init.type === AST_NODE.variableDeclaration
				? renderStatement(state, statement.init)
				: renderExpression(state, statement.init),
		);
	}

	const test = forkBlock(state, current);
	const body = createStepBlock(state);
	const update = createStepBlock(state);
	const after = createStepBlock(state);

	setBranchTerminator(
		test,
		statement.test ? renderExpression(state, statement.test) : "true",
		body.id,
		after.id,
	);

	const bodyExit = lowerBlock(state, statement.body, body);
	if (bodyExit) {
		setJumpTerminator(bodyExit, update.id);
	}

	if (statement.update) {
		update.lines.push(renderExpression(state, statement.update));
	}
	setJumpTerminator(update, test.id);

	return after;
};

const lowerDoWhileStatement = (state, statement, current) => {
	const body = forkBlock(state, current);
	const test = createStepBlock(state);
	const after = createStepBlock(state);

	const bodyExit = lowerBlock(state, statement.body, body);
	if (bodyExit) {
		setJumpTerminator(bodyExit, test.id);
	}

	setBranchTerminator(
		test,
		renderExpression(state, statement.test),
		body.id,
		after.id,
	);

	return after;
};

const lowerStatement = (state, statement, current) => {
	if (isBareAwaitStatement(statement)) {
		return lowerAwaitStatement(state, statement, current);
	}
	const unusedAwaitBlock = lowerUnusedHoistedAwait(state, statement, current);
	if (unusedAwaitBlock) {
		return unusedAwaitBlock;
	}
	if (statement.type === AST_NODE.returnStatement) {
		return lowerReturnStatement(state, statement, current);
	}
	if (!containsAwait(statement)) {
		if (containsIncompleteReturn(statement)) {
			const next = forkBlock(state, current);
			stripIncompleteReturns(statement);
			next.lines.push(renderStatement(state, statement));
			return next;
		}
		current.lines.push(renderStatement(state, statement));
		return current;
	}
	if (statement.type === AST_NODE.ifStatement) {
		return lowerIfStatement(state, statement, current);
	}
	if (statement.type === AST_NODE.whileStatement) {
		return lowerWhileStatement(state, statement, current);
	}
	if (statement.type === AST_NODE.forStatement) {
		return lowerForStatement(state, statement, current);
	}
	if (statement.type === AST_NODE.doWhileStatement) {
		return lowerDoWhileStatement(state, statement, current);
	}
	return lowerExpressionAwait(state, statement, current);
};
