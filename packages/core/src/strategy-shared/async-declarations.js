import { AST_NODE, INDENT, OBJECT_TYPE } from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { parseStatements, rebaseLines } from "./async-ast-utils.js";
import {
	ADD_TASK_FUNCTION_NAME,
	ADD_TASK_LINE_OFFSET,
	ASYNC_ADD_SUFFIX,
	ASYNC_ENUM_LINE_OFFSET,
	ASYNC_ENUM_NAME,
	ASYNC_ENUM_NONE_MEMBER,
	ASYNC_STATUS_CONSUMED,
	ASYNC_STATUS_ENUM_LINE_OFFSET,
	ASYNC_STATUS_ENUM_NAME,
	ASYNC_STATUS_MEMBER_NAMES,
	ASYNC_STATUS_RUNNING,
	ASYNC_STATUS_RUNNING_CHILD,
	ASYNC_TASK_ITEM_LINE_OFFSET,
	ASYNC_TASK_ITEM_TYPE_NAME,
	ASYNC_TYPE_LINE_OFFSET,
	SYNTHESIZED_STRIDE,
	SYNTHESIZED_WRAPPER_GAP,
	TASK_CHILD_PARAMETER_NAME,
	TASK_ITEM_PARAMETER_NAME,
	TASK_PARAMETER_NAME,
	TASK_QUEUE_GROWTH_STEP,
	TASK_QUEUE_VARIABLE_NAME,
	toUpperSnakeCase,
} from "./async-constants.js";
import {
	ASYNC_TYPE_SOURCE,
	buildTypeMembers,
	makeWrapperSource,
} from "./async-task-types.js";

const buildEnumSource = (enumName, memberNames) => {
	const members = memberNames
		.map((name) => {
			return `${INDENT}${name}`;
		})
		.join(",\n");
	return `enum ${enumName} {\n${members},\n}\n`;
};

const ASYNC_TASK_ITEM_SOURCE = `type ${ASYNC_TASK_ITEM_TYPE_NAME} = {\n${INDENT}status: ${ASYNC_STATUS_ENUM_NAME}\n${INDENT}task?: ${OBJECT_TYPE}\n${INDENT}type: ${ASYNC_ENUM_NAME}\n${INDENT}step: u8\n}\n`;

const buildAddTaskSource = () => {
	const reusedItem = `${TASK_QUEUE_VARIABLE_NAME}[reuseIndex]`;
	const lines = [
		`const ${ADD_TASK_FUNCTION_NAME} = (${TASK_PARAMETER_NAME}: ${OBJECT_TYPE}, taskType: ${ASYNC_ENUM_NAME}, ${TASK_CHILD_PARAMETER_NAME}: boolean): ${ASYNC_TASK_ITEM_TYPE_NAME} => {`,
		`${INDENT}for (let reuseIndex: u16 = 0; reuseIndex < ${TASK_QUEUE_VARIABLE_NAME}.length(); reuseIndex += 1) {`,
		`${INDENT.repeat(2)}if (${reusedItem}.status == ${ASYNC_STATUS_CONSUMED}) {`,
		`${INDENT.repeat(3)}${reusedItem}.status = ${TASK_CHILD_PARAMETER_NAME} ? ${ASYNC_STATUS_RUNNING_CHILD} : ${ASYNC_STATUS_RUNNING}`,
		`${INDENT.repeat(3)}${reusedItem}.task = ${TASK_PARAMETER_NAME}`,
		`${INDENT.repeat(3)}${reusedItem}.type = taskType`,
		`${INDENT.repeat(3)}${reusedItem}.step = 0`,
		`${INDENT.repeat(3)}return ${reusedItem}`,
		`${INDENT.repeat(2)}}`,
		`${INDENT}}`,
		`${INDENT}const ${TASK_ITEM_PARAMETER_NAME}: ${ASYNC_TASK_ITEM_TYPE_NAME} = {`,
		`${INDENT.repeat(2)}status: ${TASK_CHILD_PARAMETER_NAME} ? ${ASYNC_STATUS_RUNNING_CHILD} : ${ASYNC_STATUS_RUNNING},`,
		`${INDENT.repeat(2)}task: ${TASK_PARAMETER_NAME},`,
		`${INDENT.repeat(2)}type: taskType,`,
		`${INDENT.repeat(2)}step: 0`,
		`${INDENT}}`,
		`${INDENT}const needed = ${TASK_QUEUE_VARIABLE_NAME}.length() + 1`,
		`${INDENT}if (needed > ${TASK_QUEUE_VARIABLE_NAME}.capacity()) {`,
		`${INDENT.repeat(2)}const remainder = needed % ${TASK_QUEUE_GROWTH_STEP}`,
		`${INDENT.repeat(2)}const target = remainder == 0 ? needed : needed + (${TASK_QUEUE_GROWTH_STEP} - remainder)`,
		`${INDENT.repeat(2)}${TASK_QUEUE_VARIABLE_NAME}.reserve(target)`,
		`${INDENT}}`,
		`${INDENT}${TASK_QUEUE_VARIABLE_NAME}.push(${TASK_ITEM_PARAMETER_NAME})`,
		`${INDENT}return ${TASK_ITEM_PARAMETER_NAME}`,
		"}",
		"",
	];
	return lines.join("\n");
};

const visitHandleTypeDependency = (handle, byTypeName, sorted, visited) => {
	if (visited.has(handle.typeName)) {
		return;
	}
	visited.add(handle.typeName);

	const dependency = handle.childType
		? byTypeName.get(handle.childType)
		: undefined;

	if (dependency) {
		visitHandleTypeDependency(dependency, byTypeName, sorted, visited);
	}

	sorted.push(handle);
};

const sortHandlesByTypeDependency = (handles) => {
	const byTypeName = new Map(
		handles.map((handle) => {
			return [handle.typeName, handle];
		}),
	);
	const sorted = [];
	const visited = new Set();

	for (const handle of handles) {
		visitHandleTypeDependency(handle, byTypeName, sorted, visited);
	}

	return sorted;
};

export const buildAddStatements = (
	handles,
	synthesizedComments,
	sourceLineCount,
	objectTypes,
) => {
	const statements = [];
	const sortedHandles = sortHandlesByTypeDependency(handles);

	if (sortedHandles.length > 0) {
		statements.push(buildAddTaskNode(sourceLineCount));
	}

	for (const {
		name,
		typeName,
		offset,
		fields,
		params,
		childNames,
		childType,
	} of sortedHandles) {
		const addName = `_${name}${ASYNC_ADD_SUFFIX}`;
		const members = buildTypeMembers(params, fields, childNames, childType);
		const { tokens } = tokenize(
			makeWrapperSource(
				addName,
				typeName,
				members,
				toUpperSnakeCase(name),
				objectTypes,
			),
		);
		const { ast, comments } = parse(tokens);
		const [statement] = ast.body;
		const statementOffset = offset + SYNTHESIZED_WRAPPER_GAP;

		rebaseLines(statement, statementOffset);

		for (const comment of comments) {
			comment.line += statementOffset;
			synthesizedComments.push(comment);
		}

		statements.push(statement);
	}

	return statements;
};

export const findTypeInsertionIndex = (ast) => {
	const leadingIndex = ast.body.findIndex((statement) => {
		return (
			statement.type !== AST_NODE.importDeclaration &&
			statement.type !== AST_NODE.typeDeclaration
		);
	});
	const afterLeading = leadingIndex === -1 ? ast.body.length : leadingIndex;

	// A generated task type may reference a user object type declared after the
	// leading import/type block, so keep the insertion point past every user
	// type declaration.
	const afterLastType = ast.body.reduce((last, statement, position) => {
		return statement.type === AST_NODE.typeDeclaration ? position + 1 : last;
	}, 0);

	return Math.max(afterLeading, afterLastType);
};

const buildEnumNode = (enumName, memberNames, lineOffset) => {
	const { tokens } = tokenize(buildEnumSource(enumName, memberNames));
	const { ast: enumAst } = parse(tokens);
	const [enumNode] = enumAst.body;
	rebaseLines(enumNode, lineOffset);
	return enumNode;
};

const buildTaskItemNode = (sourceLineCount) => {
	const { tokens } = tokenize(ASYNC_TASK_ITEM_SOURCE);
	const { ast: taskItemAst } = parse(tokens);
	const [taskItemNode] = taskItemAst.body;
	rebaseLines(taskItemNode, sourceLineCount + ASYNC_TASK_ITEM_LINE_OFFSET);
	return taskItemNode;
};

const buildAddTaskNode = (sourceLineCount) => {
	const [statement] = parseStatements(buildAddTaskSource());
	rebaseLines(statement, sourceLineCount + ADD_TASK_LINE_OFFSET);
	return statement;
};

export const injectAsyncDeclarations = (ast, handles, sourceLineCount) => {
	const insertIndex = findTypeInsertionIndex(ast);
	const handleMemberNames = handles.map(({ name }) => {
		return toUpperSnakeCase(name);
	});
	const enumNode = buildEnumNode(
		ASYNC_ENUM_NAME,
		[ASYNC_ENUM_NONE_MEMBER, ...handleMemberNames],
		sourceLineCount + ASYNC_ENUM_LINE_OFFSET,
	);
	const statusNode = buildEnumNode(
		ASYNC_STATUS_ENUM_NAME,
		ASYNC_STATUS_MEMBER_NAMES,
		sourceLineCount + ASYNC_STATUS_ENUM_LINE_OFFSET,
	);
	const taskItemNode = buildTaskItemNode(sourceLineCount);
	const typeNodes = sortHandlesByTypeDependency(handles).map(
		({ typeName, fields, params, childNames, childType }, index) => {
			const members = buildTypeMembers(params, fields, childNames, childType);
			const { tokens } = tokenize(ASYNC_TYPE_SOURCE(typeName, members));
			const { ast: typeAst } = parse(tokens);
			const [typeNode] = typeAst.body;
			rebaseLines(
				typeNode,
				sourceLineCount + ASYNC_TYPE_LINE_OFFSET + index * SYNTHESIZED_STRIDE,
			);
			return typeNode;
		},
	);
	const nodes = [enumNode, statusNode, taskItemNode, ...typeNodes];
	ast.body.splice(insertIndex, 0, ...nodes);
	return { insertIndex: insertIndex + nodes.length, nodes };
};
