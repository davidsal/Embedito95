import { evaluateConstant } from "../const-eval.js";
import { AST_NODE, DATA_TYPE, ERROR_CODE, FLOAT_TYPES } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { getDeclaration } from "./declaration-accessors.js";
import { selfContextStack } from "./expression-objects.js";
import { isMethodOnlyType } from "./object-method-validation.js";
import {
	checkCastTargetType,
	handleBinaryExpression,
	handleConditionalExpression,
	handleUnaryExpression,
} from "./range-expressions.js";
import { getRootName, TYPE_RANGES } from "./types.js";
import { resolveVariableType } from "./variables.js";
import { walk } from "./walk.js";

const handleScopeEnter = (state, node) => {
	if (state.scopeNodeTypes.has(node.type)) {
		state.context.rangeScopes.push(new Map());
	}
};

const handleObjectLiteralEnter = (state, node) => {
	if (node.type === AST_NODE.objectLiteral) {
		const typeName = state.objectLiteralTypeMap.get(node);
		if (typeName) {
			selfContextStack.push(typeName);
		}
	}
};

const handleFunctionExpression = (state, node) => {
	if (node.type !== AST_NODE.functionExpression) {
		return;
	}
	for (const param of node.params) {
		if (!param?.typeAnnotation) {
			continue;
		}
		const type = param.typeAnnotation.type;
		const range = TYPE_RANGES[type];
		if (!range && type !== DATA_TYPE.string) {
			continue;
		}
		state.context.registerVariableRange(param.name, {
			...(range ?? {}),
			type,
			isConst: false,
		});
	}
};

const handleVariableDeclaration = (state, node) => {
	if (node.type !== AST_NODE.variableDeclaration) {
		return;
	}
	const declaration = getDeclaration(node);
	const name = declaration?.id?.name;
	const variableType = resolveVariableType(
		state.ast,
		node,
		state.wordType,
		state.context.resolveVariableNameType,
		state.resolveLibraryCallType,
		state.wordSize,
		state.objectTypes,
	);
	const range = variableType ? TYPE_RANGES[variableType] : null;

	if (name) {
		state.context.registerVariableRange(
			name,
			range
				? {
						...range,
						type: variableType,
						isConst: node.kind === "const",
					}
				: { type: variableType, isConst: node.kind === "const" },
		);
	}
	if (name && variableType) {
		state.targetTypeStack.push(variableType);
	}

	const floatContext = FLOAT_TYPES.has(variableType) ? variableType : null;
	const resolvedValue = evaluateConstant(
		state.ast,
		declaration?.init,
		floatContext,
	);

	if (resolvedValue !== null) {
		state.context.checkValueOutOfRange(
			name,
			resolvedValue,
			variableType ?? state.wordType,
			declaration?.init?.loc ?? node.loc,
		);
	}

	state.context.checkAssignmentTypeMismatch(
		name,
		variableType ?? state.wordType,
		declaration?.init,
		floatContext,
		declaration?.init?.loc ?? node.loc,
		declaration?.id?.typeAnnotation ? state.resolveCallType : null,
	);
};

// Rejects assigning to a name that is a METHOD of the receiver's type. A closure
// lowers to C++ free functions over the shared `Object<T>` handle, so there is no
// per-instance slot to overwrite. The exception is a LOCAL CALLBACK RECORD (a
// type declared in this file with 0 fields and >=1 method): it lowers to a handle
// whose methods ARE function-pointer members of the struct, so the slot is real
// and reassigning it (`h.onEvent = f`) has TS semantics. A library method-only
// type (e.g. `SpiBus`, a hand-written class) is NOT local and keeps the error:
// its methods are member functions with no writable slot.
const checkMethodAssignment = (state, node) => {
	if (node.type !== AST_NODE.assignmentExpression) {
		return;
	}
	const { left } = node;
	if (left?.type !== AST_NODE.memberExpression) {
		return;
	}
	if (left.object?.type !== AST_NODE.identifier) {
		return;
	}
	const methodName = left.property?.name;
	if (!methodName) {
		return;
	}
	const receiverType = state.variableTypes.resolve(
		left.object.name,
		left.object.loc,
	);
	const typeInfo = state.objectTypes?.[receiverType];
	if (!typeInfo?.methods?.[methodName]) {
		return;
	}
	const isLocalCallbackRecord =
		state.localObjectTypeNames?.has(receiverType) && isMethodOnlyType(typeInfo);
	if (isLocalCallbackRecord) {
		return;
	}
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.methodAssignment,
			params: { name: `${left.object.name}.${methodName}` },
			location: left.loc ?? node.loc,
		}),
	);
};

const handleAssignmentExpression = (state, node) => {
	if (node.type !== AST_NODE.assignmentExpression) {
		return;
	}
	const { left, right } = node;
	const rootName = getRootName(left);
	const isSimpleTarget = left.type === AST_NODE.identifier;

	checkMethodAssignment(state, node);

	if (isSimpleTarget && state.context.resolveVariableRange(rootName)?.isConst) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.constReassignment,
				params: { name: rootName },
				location: left.loc ?? node.loc,
			}),
		);
	}

	const targetType = isSimpleTarget
		? state.context.resolveVariableRange(left.name)?.type
		: null;
	state.targetTypeStack.push(targetType);

	if (node.operator === "=") {
		if (!isSimpleTarget) {
			return;
		}
		const floatContext = FLOAT_TYPES.has(targetType) ? targetType : null;
		const resolvedValue = evaluateConstant(state.ast, right, floatContext);

		if (resolvedValue !== null) {
			state.context.checkValueOutOfRange(
				left.name,
				resolvedValue,
				targetType ?? state.wordType,
				right.loc ?? node.loc,
			);
		}

		state.context.checkAssignmentTypeMismatch(
			left.name,
			targetType ?? state.wordType,
			right,
			floatContext,
			right.loc ?? node.loc,
			state.resolveCallType,
		);
	}
};

const handleUpdateExpression = (state, node) => {
	if (node.type !== AST_NODE.updateExpression) {
		return;
	}
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.updateExpressionNotAllowed,
			params: {
				operator: node.operator,
				operator0: node.operator[0],
			},
			location: node.loc,
		}),
	);

	const name = node.argument?.name;

	if (name && state.context.resolveVariableRange(name)?.isConst) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.constReassignment,
				params: { name },
				location: node.argument?.loc ?? node.loc,
			}),
		);
	}
};

const handleScopeExit = (state, node) => {
	if (state.scopeNodeTypes.has(node.type)) {
		state.context.rangeScopes.pop();
	}
};

const handleObjectLiteralExit = (state, node) => {
	if (node.type === AST_NODE.objectLiteral) {
		const typeName = state.objectLiteralTypeMap.get(node);
		if (typeName) {
			selfContextStack.pop();
		}
	}
};

const handleTargetStackExit = (state, node) => {
	if (
		node.type === AST_NODE.variableDeclaration ||
		node.type === AST_NODE.assignmentExpression
	) {
		state.targetTypeStack.pop();
	}
};

export const runRangeCheck = (state) => {
	walk(state.ast, {
		enter: (node) => {
			handleScopeEnter(state, node);
			handleObjectLiteralEnter(state, node);
			handleFunctionExpression(state, node);
			handleVariableDeclaration(state, node);
			handleAssignmentExpression(state, node);
			handleUpdateExpression(state, node);
			checkCastTargetType(state, node);
			handleBinaryExpression(state, node);
			handleConditionalExpression(state, node);
			handleUnaryExpression(state, node);
		},
		exit: (node) => {
			handleScopeExit(state, node);
			handleObjectLiteralExit(state, node);
			handleTargetStackExit(state, node);
		},
	});
};
