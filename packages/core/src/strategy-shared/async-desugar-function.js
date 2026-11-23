import { parseAsyncTaskType } from "../checker/async-task-type.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import {
	ASYNC_TASK_ITEM_TYPE_NAME,
	COMPLETE_RETURN,
	DEFAULT_LOCAL_TYPE,
	TASK_STATE_VALUE_KEY,
} from "./async-constants.js";
import { lowerSequence } from "./async-lower-statements.js";
import {
	buildStepFunctionSource,
	collapseJumpBlocks,
	createStepBlock,
} from "./async-step-machine.js";
import {
	collectOnlyAssignedTaskLocals,
	collectTaskParams,
	hoistTaskLocals,
	rewriteReferences,
} from "./async-task-state.js";

const resolveChildType = () => {
	return ASYNC_TASK_ITEM_TYPE_NAME;
};

// An async function that returns a value stores it in the task so the parent
// can read it. The field must exist on the task type, otherwise the type has no
// fields and is not a shared handle, so `task.value = x` would mutate a copy.
const resolveReturnValueFieldType = (returnType) => {
	if (!returnType?.name) {
		return DEFAULT_LOCAL_TYPE;
	}
	const asyncTask = parseAsyncTaskType(returnType.name);
	if (asyncTask) {
		return asyncTask.argumentType ?? DEFAULT_LOCAL_TYPE;
	}
	return returnType.name;
};

const addReturnValueField = (fields, returnType) => {
	const alreadyPresent = fields.some((field) => {
		return field.name === TASK_STATE_VALUE_KEY;
	});
	if (alreadyPresent) {
		return;
	}
	fields.push({
		name: TASK_STATE_VALUE_KEY,
		type: resolveReturnValueFieldType(returnType),
	});
};

// The function node only carries an EXPLICIT `: Type` annotation. An async
// helper with an inferred anonymous object return has no annotation, so the
// payload must come from the project's resolved return types instead of
// falling back to the scalar default.
const resolveFunctionReturnType = (functionNode, resolvedReturnType) => {
	if (functionNode.returnType?.name) {
		return functionNode.returnType;
	}
	return resolvedReturnType ? { name: resolvedReturnType } : null;
};

export const desugarAsyncFunction = (
	name,
	typeName,
	functionNode,
	source,
	functionReturnTypes,
	asyncFunctionNames = new Set(),
	inlineTimers = new Map(),
	inlineWrappers = new Map(),
	asyncParams = new Map(),
	variableTypes = null,
	resolvedReturnType = null,
) => {
	const params = collectTaskParams(functionNode);
	const hoistedFields = hoistTaskLocals(
		functionNode,
		functionReturnTypes,
		variableTypes,
	);
	const hoistedNames = new Set(
		hoistedFields.map((field) => {
			return field.name;
		}),
	);
	const onlyAssignedLocals = collectOnlyAssignedTaskLocals(
		functionNode,
		hoistedNames,
	);

	if (params.length > 0) {
		const names = new Set(
			params.map((param) => {
				return param.name;
			}),
		);
		for (const statement of functionNode.body.body) {
			rewriteReferences(statement, names);
		}
	}

	const state = {
		source,
		blocks: [],
		childNames: [],
		asyncFunctionNames,
		inlineTimers,
		inlineWrappers,
		asyncParams,
		unusedAssignmentCounts: onlyAssignedLocals,
		droppedFieldNames: new Set(),
		inlineFields: [],
	};
	const entry = createStepBlock(state);
	const exit = lowerSequence(state, functionNode.body.body, entry);

	if (exit) {
		exit.lines.push(COMPLETE_RETURN);
	}

	const fields = hoistedFields.filter((field) => {
		return !state.droppedFieldNames.has(field.name);
	});

	if (state.hasReturnValue) {
		addReturnValueField(
			fields,
			resolveFunctionReturnType(functionNode, resolvedReturnType),
		);
	}

	fields.push(...state.inlineFields);

	collapseJumpBlocks(state);

	const childNames = state.childNames;
	const childType = childNames.length > 0 ? resolveChildType() : null;
	const stepSource = buildStepFunctionSource(state, name, typeName);
	const { tokens } = tokenize(stepSource);
	const { ast } = parse(tokens);
	return {
		statement: ast.body[0] ?? null,
		fields,
		params,
		childNames,
		childType,
	};
};
