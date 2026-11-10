import { AST_NODE, parse, tokenize } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import { parseSource } from "./src/language/language-snapshot-harness.mjs";

export const ASYNC_TASK_DECLARATION = [
	"type AsyncTask<T = null> = {",
	"    completed: boolean",
	"    value: T",
	"}",
].join("\n");

const parseWithErrors = (source) => {
	const { tokens } = tokenize(source);
	return parse(tokens);
};

const findTypeDeclaration = (ast, name) => {
	return ast.body.find((statement) => {
		return (
			statement.type === AST_NODE.typeDeclaration && statement.name === name
		);
	});
};

const findVariableDeclaration = (ast, name) => {
	return ast.body.find((statement) => {
		return (
			statement.type === AST_NODE.variableDeclaration &&
			statement.declarations?.[0]?.id?.name === name
		);
	});
};

const findFunctionInitializer = (ast, name) => {
	return findVariableDeclaration(ast, name)?.declarations?.[0]?.init ?? null;
};

export const runAsyncTaskParserChecks = () => {
	const source = [
		ASYNC_TASK_DECLARATION,
		"const makeTask = async (): AsyncTask<i8> => {",
		"    return 1",
		"}",
		"const task: AsyncTask<i8> = makeTask()",
		"const values: u8[] = []",
		"const maybe: AsyncTask<i8> | null = null",
		"const bigger = 1 < 2",
	].join("\n");
	const { ast } = parseSource(source);
	const declaration = findTypeDeclaration(ast, "AsyncTask");
	const functionInitializer = findFunctionInitializer(ast, "makeTask");
	const taskDeclaration = findVariableDeclaration(ast, "task");
	const valuesDeclaration = findVariableDeclaration(ast, "values");
	const maybeDeclaration = findVariableDeclaration(ast, "maybe");
	const biggerDeclaration = findVariableDeclaration(ast, "bigger");
	const typeParameter = declaration?.typeParameters?.[0] ?? null;
	const valueField = declaration?.members?.find((member) => {
		return member.name === "value";
	});
	const taskAnnotation = taskDeclaration?.declarations?.[0]?.id?.typeAnnotation;
	const valuesAnnotation =
		valuesDeclaration?.declarations?.[0]?.id?.typeAnnotation;
	const maybeAnnotation =
		maybeDeclaration?.declarations?.[0]?.id?.typeAnnotation;
	const { errors: parseErrors } = parseWithErrors(source);

	return [
		expectEqual(
			"type declaration keeps structured type parameters",
			`${typeParameter?.name}:${typeParameter?.defaultType?.name}`,
			"T:null",
		),
		expectEqual(
			"type declaration keeps the type parameter as the field type",
			valueField?.returnType,
			"T",
		),
		expectEqual(
			"async function return annotation exposes structured type arguments",
			`${functionInitializer?.returnType?.name}:${functionInitializer?.returnType?.typeArguments?.[0]?.name}`,
			"AsyncTask<i8>:i8",
		),
		expectEqual(
			"variable annotation exposes structured type arguments",
			`${taskAnnotation?.type}:${taskAnnotation?.typeArguments?.[0]?.name}`,
			"AsyncTask<i8>:i8",
		),
		expectEqual(
			"array annotations are unaffected by type arguments",
			valuesAnnotation?.type,
			"u8[]",
		),
		expectEqual(
			"nullable unions keep the parametrized member",
			maybeAnnotation?.type,
			"AsyncTask<i8> | null",
		),
		expectEqual(
			"comparison operator is still parsed as an expression",
			biggerDeclaration?.declarations?.[0]?.init?.operator,
			"<",
		),
		expectEqual(
			"generic declarations and references parse without unexpected tokens",
			parseErrors.length,
			0,
		),
	];
};
