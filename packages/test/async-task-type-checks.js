import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	check,
	ERROR_CODE,
	parse,
	tokenize,
	UTF8,
	unwrapAsyncTaskType,
} from "embedito95-core";
import {
	ASYNC_TASK_DECLARATION,
	runAsyncTaskParserChecks,
} from "./async-task-type-parser-checks.js";
import { REGISTRY_LIBRARIES_DIRECTORY } from "./constants.js";
import { expectEqual } from "./reporting.js";
import {
	checkSource,
	createLibraries,
} from "./src/language/language-snapshot-harness.mjs";

const ASYNC_LIBRARY_FILE = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	"async",
	"main.e95",
);
const TIME_LIBRARY_NAME = "@embedito95/time";
const PROGRAM_SUFFIX = [
	"const setup = () => {}",
	"const main = () => { setup() }",
	"main()",
].join("\n");

const LIBRARIES = createLibraries();

const TIME_LIBRARY_LIBRARIES = createLibraries({
	knownLibraries: new Set([TIME_LIBRARY_NAME]),
	libraryExports: {
		[TIME_LIBRARY_NAME]: new Set([
			"getMillis",
			"getMicros",
			"hasElapsed",
			"hasElapsedMicros",
		]),
	},
	libraryFunctions: {
		[TIME_LIBRARY_NAME]: {
			getMillis: { params: [], returnType: "u32" },
			getMicros: { params: [], returnType: "u32" },
			hasElapsed: {
				params: [
					{ name: "start", type: "u32" },
					{ name: "duration", type: "u32" },
				],
				returnType: "boolean",
			},
			hasElapsedMicros: {
				params: [
					{ name: "start", type: "u32" },
					{ name: "duration", type: "u32" },
				],
				returnType: "boolean",
			},
		},
	},
});

const hasErrorCode = (errors, code) => {
	return errors.some((error) => {
		return error.code === code;
	});
};

const checkAsyncBody = (body) => {
	const source = [ASYNC_TASK_DECLARATION, PROGRAM_SUFFIX, body, ""].join("\n");
	const { errors } = checkSource(source, LIBRARIES);
	return errors;
};

const checkAsyncCallTypes = () => {
	const asyncFunction = [
		"const getNumberAsync = async () => {",
		"    return 20",
		"}",
	].join("\n");
	const withoutAwait = checkAsyncBody(
		[asyncFunction, "const run = async () => {"]
			.concat(["    const n: i8 = getNumberAsync()", "}"])
			.join("\n"),
	);
	const withAwait = checkAsyncBody(
		[asyncFunction, "const run = async () => {"]
			.concat(["    const n: i8 = await getNumberAsync()", "}"])
			.join("\n"),
	);
	const taskTyped = checkAsyncBody(
		[asyncFunction, "const run = async () => {"]
			.concat([
				"    const task: AsyncTask<i8> = getNumberAsync()",
				"    task",
				"}",
			])
			.join("\n"),
	);
	const invalidAwait = checkAsyncBody(
		[
			"const run = async () => {",
			"    const value: i8 = 1",
			"    const n: i8 = await value",
			"}",
		].join("\n"),
	);
	return [
		expectEqual(
			"async call assigned without await fails with assignmentTypeMismatch",
			hasErrorCode(withoutAwait, ERROR_CODE.assignmentTypeMismatch),
			true,
		),
		expectEqual(
			"awaited async call is assignable to the payload type",
			hasErrorCode(withAwait, ERROR_CODE.assignmentTypeMismatch),
			false,
		),
		expectEqual(
			"awaited async call is a valid await target",
			hasErrorCode(withAwait, ERROR_CODE.invalidAwaitTarget),
			false,
		),
		expectEqual(
			"async call is assignable to an AsyncTask annotation",
			hasErrorCode(taskTyped, ERROR_CODE.assignmentTypeMismatch),
			false,
		),
		expectEqual(
			"await on a non-AsyncTask value fails with invalidAwaitTarget",
			hasErrorCode(invalidAwait, ERROR_CODE.invalidAwaitTarget),
			true,
		),
	];
};

const checkAsyncCallStatement = () => {
	const source = [
		"const blinkLed = async () => {}",
		"const setup = () => {}",
		"const main = async () => {",
		"    setup()",
		"    blinkLed()",
		"}",
		"main()",
	].join("\n");
	const { errors } = checkSource(source, LIBRARIES);
	const unexpected = errors.filter((error) => {
		return (
			error.code === ERROR_CODE.unexpectedToken ||
			error.code === ERROR_CODE.unexpectedEof ||
			error.code === ERROR_CODE.invalidAwaitTarget ||
			error.code === ERROR_CODE.assignmentTypeMismatch
		);
	});
	return expectEqual(
		"async call as a standalone statement is accepted",
		unexpected.length,
		0,
	);
};

const checkInferredAsyncCallVariableType = () => {
	const source = [
		"const getNumberAsync = async () => {",
		"    return 20",
		"}",
		"const run = async () => {",
		"    const task = getNumberAsync()",
		"    const n: i8 = await task",
		"    n",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    run()",
		"}",
		"main()",
		"",
	].join("\n");
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens, source);
	const { errors, variableTypes } = check(ast, {
		...LIBRARIES,
		comments,
		source,
		wordSize: 32,
	});
	return [
		expectEqual(
			"unannotated async call is not reported against the default word type",
			errors.length,
			0,
		),
		expectEqual(
			"unannotated async call infers AsyncTask<T>",
			variableTypes.get("task"),
			"AsyncTask<i8>",
		),
		expectEqual(
			"awaited unannotated async task is assignable to its payload type",
			variableTypes.get("n"),
			"i8",
		),
	];
};

const checkAwaitEmptyAsyncTask = () => {
	const source = [
		ASYNC_TASK_DECLARATION,
		"const makeTask = async (): AsyncTask => {",
		"    return { completed: true }",
		"}",
		"const run = async () => {",
		"    const task: AsyncTask = makeTask()",
		"    const n: i8 = await task",
		"    n",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    run()",
		"}",
		"main()",
		"",
	].join("\n");
	const { errors } = checkSource(source, LIBRARIES);
	return [
		expectEqual(
			"awaiting an AsyncTask without argument yields null",
			unwrapAsyncTaskType("AsyncTask"),
			"null",
		),
		expectEqual(
			"awaiting an AsyncTask without argument is not assignable to i8",
			hasErrorCode(errors, ERROR_CODE.assignmentTypeMismatch),
			true,
		),
	];
};

const GET_NUMBER_ASYNC_DECLARATION = [
	"const getNumberAsync = async () => {",
	"    return 20",
	"}",
].join("\n");

const checkTaskComparisonMismatch = () => {
	const errors = checkAsyncBody(
		[
			GET_NUMBER_ASYNC_DECLARATION,
			"const run = async () => {",
			"    const same = 1 == getNumberAsync()",
			"    same",
			"}",
		].join("\n"),
	);
	return expectEqual(
		"comparing a value with an AsyncTask fails with comparisonTypeMismatch",
		hasErrorCode(errors, ERROR_CODE.comparisonTypeMismatch),
		true,
	);
};

const checkTaskFieldResolution = () => {
	const validFields = checkAsyncBody(
		[
			GET_NUMBER_ASYNC_DECLARATION,
			"const run = async () => {",
			"    const result: AsyncTask<i8> = getNumberAsync()",
			"    const done: boolean = result.completed",
			"    const value: i8 = result.value",
			"    done",
			"    value",
			"}",
		].join("\n"),
	);
	const invalidField = checkAsyncBody(
		[
			GET_NUMBER_ASYNC_DECLARATION,
			"const run = async () => {",
			"    const result: AsyncTask<i8> = getNumberAsync()",
			"    const bad: string = result.value",
			"    bad",
			"}",
		].join("\n"),
	);
	return [
		expectEqual(
			"AsyncTask<i8> fields resolve to their declared types",
			hasErrorCode(validFields, ERROR_CODE.assignmentTypeMismatch),
			false,
		),
		expectEqual(
			"AsyncTask<i8>.value is not assignable to an incompatible type",
			hasErrorCode(invalidField, ERROR_CODE.assignmentTypeMismatch),
			true,
		),
	];
};

const checkMemberAccessOnPrimitive = () => {
	const errors = checkAsyncBody(
		[
			GET_NUMBER_ASYNC_DECLARATION,
			"const run = async () => {",
			"    const value: i8 = (await getNumberAsync()).value",
			"    value",
			"}",
		].join("\n"),
	);
	return expectEqual(
		"member access on a primitive awaited value fails with invalidMemberAccess",
		hasErrorCode(errors, ERROR_CODE.invalidMemberAccess),
		true,
	);
};

const checkAwaitMemberPrecedence = () => {
	const errors = checkAsyncBody(
		[
			GET_NUMBER_ASYNC_DECLARATION,
			"const run = async () => {",
			"    const value: i8 = await getNumberAsync().value",
			"    value",
			"}",
		].join("\n"),
	);
	return [
		expectEqual(
			"await over a resolved payload member fails with invalidAwaitTarget",
			hasErrorCode(errors, ERROR_CODE.invalidAwaitTarget),
			true,
		),
		expectEqual(
			"await over a task member does not report invalidMemberAccess",
			hasErrorCode(errors, ERROR_CODE.invalidMemberAccess),
			false,
		),
	];
};

const checkMemberAccessFalsePositives = () => {
	const errors = checkAsyncBody(
		[
			"type Box = {",
			"    count: i16",
			"    read: () => i16",
			"}",
			"enum Color { RED, GREEN }",
			"const makeBox = (): Box => {",
			"    return {",
			"        count: 1,",
			"        read: () => { return this.count }",
			"    }",
			"}",
			"const run = async () => {",
			'    const text: string = "abc"',
			"    const size: u32 = text.length()",
			"    const values: i16[] = [1, 2, 3]",
			"    const count: u32 = values.length()",
			"    const box: Box = makeBox()",
			"    const total: i16 = box.count + box.read()",
			"    const color: Color = Color.RED",
			"    size",
			"    count",
			"    total",
			"    color",
			"}",
		].join("\n"),
	);
	return expectEqual(
		"member access on strings, arrays, objects, enums and this is accepted",
		hasErrorCode(errors, ERROR_CODE.invalidMemberAccess),
		false,
	);
};

const checkTypeArgumentsNotAllowed = () => {
	const genericDeclaration = checkAsyncBody(
		["type Foo<T> = {", "    value: T", "}"].join("\n"),
	);
	const parametrizedUse = checkAsyncBody(
		[
			"type Foo = {",
			"    value: i8",
			"}",
			"const make = (): Foo<i8> => {",
			"    return { value: 1 }",
			"}",
			"const run = async () => {",
			"    make()",
			"}",
		].join("\n"),
	);
	return [
		expectEqual(
			"generic user declarations report typeArgumentsNotAllowed",
			hasErrorCode(genericDeclaration, ERROR_CODE.typeArgumentsNotAllowed),
			true,
		),
		expectEqual(
			"parametrized user type uses report typeArgumentsNotAllowed",
			hasErrorCode(parametrizedUse, ERROR_CODE.typeArgumentsNotAllowed),
			true,
		),
	];
};

const checkAsyncLibrary = () => {
	const source = readFileSync(ASYNC_LIBRARY_FILE, UTF8);
	const { tokens } = tokenize(source);
	const { ast, errors: parseErrors, comments } = parse(tokens, source);
	const { errors } = check(ast, {
		...TIME_LIBRARY_LIBRARIES,
		isLibrary: true,
		comments,
		source,
		wordSize: 32,
	});
	return [
		expectEqual(
			"core async library parses without unexpected tokens",
			parseErrors.length,
			0,
		),
		expectEqual(
			"core async library checks with zero diagnostics",
			errors.length,
			0,
		),
	];
};

export const runAsyncTaskTypeChecks = () => {
	return [
		...runAsyncTaskParserChecks(),
		...checkAsyncCallTypes(),
		checkAsyncCallStatement(),
		...checkInferredAsyncCallVariableType(),
		...checkAwaitEmptyAsyncTask(),
		checkTaskComparisonMismatch(),
		...checkTaskFieldResolution(),
		checkMemberAccessOnPrimitive(),
		...checkAwaitMemberPrecedence(),
		checkMemberAccessFalsePositives(),
		...checkTypeArgumentsNotAllowed(),
		...checkAsyncLibrary(),
	];
};
