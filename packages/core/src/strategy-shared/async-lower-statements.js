import { AST_NODE } from "../constants.js";
import { COMPLETE_RETURN, INCOMPLETE_RETURN } from "./async-constants.js";
import {
	lowerAwaitStatement,
	lowerExpressionAwait,
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
	if (isIncompleteReturn(statement)) {
		current.lines.push(INCOMPLETE_RETURN);
		return null;
	}
	if (isCompleteOnlyLiteral(statement.argument)) {
		current.lines.push(COMPLETE_RETURN);
		return null;
	}
	const value = getTaskStateValue(statement.argument);
	current.lines.push(COMPLETE_RETURN);
	if (value) {
		state.hasReturnValue = true;
		current.lines.push(`task.value = ${renderExpression(state, value)}`);
	}
	return null;
};

const lowerIfStatement = (state, statement, current) => {
	const consequentEntry = createStepBlock(state);
	const alternateEntry = statement.alternate ? createStepBlock(state) : null;
	const after = createStepBlock(state);

	setBranchTerminator(
		current,
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

	setBranchTerminator(
		test,
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
