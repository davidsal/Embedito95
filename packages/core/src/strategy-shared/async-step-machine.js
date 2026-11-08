import { AST_NODE, INDENT } from "../constants.js";
import { formatNode } from "../formatter/format.js";
import {
	ASYNC_TASK_ITEM_TYPE_NAME,
	INCOMPLETE_RETURN,
	STEP_REFERENCE,
	TASK_ITEM_PARAMETER_NAME,
	TASK_PARAMETER_NAME,
	TERMINATOR_BRANCH,
	TERMINATOR_JUMP,
} from "./async-constants.js";

export const createStepBlock = (state) => {
	const block = { id: state.blocks.length, lines: [], terminator: null };
	state.blocks.push(block);
	return block;
};

export const renderStatement = (state, statement) => {
	return formatNode(statement, 0, new Map(), state.source);
};

export const renderExpression = (state, expression) => {
	return formatNode(expression, 0, new Map(), state.source);
};

export const isLiteralTrue = (node) => {
	return node?.type === AST_NODE.literal && node.value === true;
};

export const isBareAwaitStatement = (statement) => {
	return (
		statement.type === AST_NODE.expressionStatement &&
		statement.expression?.type === AST_NODE.awaitExpression
	);
};

export const containsAwait = (node) => {
	if (!node || typeof node !== "object") {
		return false;
	}
	if (node.type === AST_NODE.awaitExpression) {
		return true;
	}
	return Object.entries(node).some(([key, value]) => {
		if (key === "loc") {
			return false;
		}
		if (Array.isArray(value)) {
			return value.some((item) => {
				return containsAwait(item);
			});
		}
		return containsAwait(value);
	});
};

export const setJumpTerminator = (block, target) => {
	block.terminator = { type: TERMINATOR_JUMP, target };
};

export const setBranchTerminator = (block, test, consequent, alternate) => {
	block.terminator = {
		type: TERMINATOR_BRANCH,
		test,
		consequent,
		alternate,
	};
};

export const forkBlock = (state, current) => {
	if (current.lines.length === 0 && !current.terminator) {
		return current;
	}
	const next = createStepBlock(state);
	setJumpTerminator(current, next.id);
	return next;
};

const renderTerminator = (terminator) => {
	if (terminator.type === TERMINATOR_JUMP) {
		return `${STEP_REFERENCE} = ${terminator.target}`;
	}
	return `if (${terminator.test}) {\n${INDENT}${STEP_REFERENCE} = ${terminator.consequent}\n} else {\n${INDENT}${STEP_REFERENCE} = ${terminator.alternate}\n}`;
};

const indentText = (text, prefix) => {
	return text
		.split("\n")
		.map((line) => {
			return line ? `${prefix}${line}` : line;
		})
		.join("\n");
};

const isTrivialJumpBlock = (block) => {
	return block.lines.length === 0 && block.terminator?.type === TERMINATOR_JUMP;
};

const resolveRedirect = (
	blocksById,
	trivialIds,
	blockId,
	visited = new Set(),
) => {
	if (visited.has(blockId)) {
		return blockId;
	}
	const block = blocksById.get(blockId);
	if (!block || !trivialIds.has(blockId)) {
		return blockId;
	}
	visited.add(blockId);
	return resolveRedirect(
		blocksById,
		trivialIds,
		block.terminator.target,
		visited,
	);
};

const resolveNewBlockId = (blocksById, trivialIds, remap, blockId) => {
	const resolved = resolveRedirect(blocksById, trivialIds, blockId);
	return remap.get(resolved) ?? resolved;
};

export const collapseJumpBlocks = (state) => {
	const blocksById = new Map(
		state.blocks.map((block) => {
			return [block.id, block];
		}),
	);
	const trivialIds = new Set(
		state.blocks
			.filter((block) => {
				return block.id !== 0 && isTrivialJumpBlock(block);
			})
			.map((block) => {
				return block.id;
			}),
	);
	if (trivialIds.size === 0) {
		return;
	}
	const kept = state.blocks.filter((block) => {
		return !trivialIds.has(block.id);
	});
	const remap = new Map(
		kept.map((block, index) => {
			return [block.id, index];
		}),
	);
	for (const block of kept) {
		if (!block.terminator) {
			continue;
		}
		if (block.terminator.type === TERMINATOR_JUMP) {
			block.terminator.target = resolveNewBlockId(
				blocksById,
				trivialIds,
				remap,
				block.terminator.target,
			);
		} else {
			block.terminator.consequent = resolveNewBlockId(
				blocksById,
				trivialIds,
				remap,
				block.terminator.consequent,
			);
			block.terminator.alternate = resolveNewBlockId(
				blocksById,
				trivialIds,
				remap,
				block.terminator.alternate,
			);
		}
	}
	state.blocks = kept.map((block, index) => {
		return { ...block, id: index };
	});
};

const renderStepBlock = (block) => {
	const lines = block.terminator
		? [...block.lines, renderTerminator(block.terminator)]
		: [...block.lines];
	const bodyLines =
		lines[lines.length - 1]?.trim() === INCOMPLETE_RETURN
			? lines.slice(0, -1)
			: lines;
	const body = indentText([...bodyLines, "break"].join("\n"), INDENT);
	return `case ${block.id}:\n${body}`;
};

const renderStepChain = (blocks) => {
	return blocks.map(renderStepBlock).join("\n");
};

export const buildStepFunctionSource = (state, name, typeName) => {
	const itemParam = `${TASK_ITEM_PARAMETER_NAME}: ${ASYNC_TASK_ITEM_TYPE_NAME}`;
	const taskLocal = `${INDENT}const ${TASK_PARAMETER_NAME} = ${TASK_ITEM_PARAMETER_NAME}.task as ${typeName}`;
	const cases = indentText(renderStepChain(state.blocks), INDENT.repeat(2));
	const defaultCase = `${INDENT.repeat(2)}default:\n${INDENT.repeat(3)}break`;
	const switchBlock = `${INDENT}switch (${STEP_REFERENCE}) {\n${cases}\n${defaultCase}\n${INDENT}}`;
	return `const ${name} = (${itemParam}) => {\n${taskLocal}\n${switchBlock}\n}`;
};
