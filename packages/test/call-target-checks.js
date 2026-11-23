// Checker cases for `callExpression` callees that are plain identifiers. A call
// is only valid when the name resolves to a function definition, a function
// reference or a function-typed parameter. Calling an integer, string, boolean,
// object, shape, enum, `AsyncTask<T>` or a variable that stores a function
// reference used to pass the checker and emit invalid C++ (or fail later in the
// lowered intermediate); these cases pin the source diagnostic at the callee.
// Sources run through the same `checkSource` pipeline the language server uses.
import { execFile } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	ENTRY_OPTION,
	ERROR_CODE,
	formatDiagnosticMessage,
	JSON_INDENTATION,
	PROJECT_TYPE,
	SEVERITY,
	UTF8,
} from "embedito95-core";
import { ASYNC_TASK_DECLARATION } from "./async-task-type-parser-checks.js";
import {
	BUILD_COMMAND,
	CALL_TARGET_TEMP_DIRECTORY_PREFIX,
	CLI_PATH,
	NODE_EXECUTABLE,
} from "./constants.js";
import { expectEqual } from "./reporting.js";
import {
	checkSource,
	createLibraries,
} from "./src/language/language-snapshot-harness.mjs";

const runProcess = promisify(execFile);

const TIMER_LIBRARY_NAME = "@embedito95/fake-timer";
const DEVICE_LIBRARY_NAME = "@embedito95/fake-device";

const LIBRARIES = createLibraries({
	knownLibraries: new Set([TIMER_LIBRARY_NAME, DEVICE_LIBRARY_NAME]),
	libraryExports: {
		[TIMER_LIBRARY_NAME]: new Set(["sleep"]),
		[DEVICE_LIBRARY_NAME]: new Set(["getDevice"]),
	},
	libraryFunctions: {
		[TIMER_LIBRARY_NAME]: {
			sleep: {
				params: [{ name: "duration", type: "u32" }],
				returnType: "void",
			},
		},
		[DEVICE_LIBRARY_NAME]: {
			getDevice: { params: [], returnType: "Device" },
		},
	},
	libraryObjectTypes: {
		[DEVICE_LIBRARY_NAME]: {
			Device: {
				fields: { speed: { type: "u16" } },
				methods: {
					beginWrite: {
						params: [{ name: "value", type: "u16" }],
						returnType: "void",
					},
				},
			},
		},
	},
});

const TIMER_IMPORT = `import { sleep } from '${TIMER_LIBRARY_NAME}'`;
const DEVICE_IMPORT = `import { getDevice } from '${DEVICE_LIBRARY_NAME}'`;

const PROGRAM_PREFIX = ASYNC_TASK_DECLARATION;
const CALLEE_LOCATION_MARKER = {
	integer: "n()",
	string: "text()",
	boolean: "flag()",
	nominal: "persona()",
	shape: "point()",
	enum: "level()",
	asyncTask: "persona()",
	localReference: "reference()",
	libraryReference: "reference()",
};

const buildProgram = (topLevelLines, bodyLines) => {
	return [
		PROGRAM_PREFIX,
		...topLevelLines,
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		...bodyLines,
		"}",
		"main()",
	].join("\n");
};

const INTEGER_SOURCE = buildProgram(
	[],
	["    const n = 1", "    const m = n()"],
);

const STRING_SOURCE = buildProgram(
	[],
	['    const text = "hola"', "    text()"],
);

const BOOLEAN_SOURCE = buildProgram(
	[],
	["    const flag = true", "    flag()"],
);

const NOMINAL_SOURCE = buildProgram(
	[
		"type Persona = { name: string, age: i32 }",
		'const getPersona = (): Persona => { return { name: "ana", age: 3 } }',
	],
	["    const persona = getPersona()", "    persona()"],
);

const SHAPE_SOURCE = buildProgram(
	[],
	["    const point = { x: 1 }", "    point()"],
);

const ENUM_SOURCE = buildProgram(
	["enum Level { LOW, HIGH }"],
	["    const level: Level = Level.HIGH", "    level()"],
);

const ASYNC_TASK_SOURCE = buildProgram(
	['const getPersona = async () => { return { name: "ana" } }'],
	["    const persona = getPersona()", "    persona()"],
);

const LOCAL_REFERENCE_SOURCE = buildProgram(
	["const getPersona = () => { return 1 }"],
	["    const reference = getPersona", "    reference()"],
);

const LIBRARY_REFERENCE_SOURCE = buildProgram(
	[TIMER_IMPORT],
	["    const reference = sleep", "    reference()"],
);

const CALLBACK_PARAMETER_SOURCE = buildProgram(
	[
		"const run = (callback: (value: i16) => void) => { callback(2) }",
		"const handler = (value: i16) => {}",
	],
	["    run(handler)"],
);

const LOCAL_FUNCTION_SOURCE = buildProgram(
	["const helper = () => { return 1 }"],
	["    const answer = helper()"],
);

const LIBRARY_FUNCTION_SOURCE = buildProgram([TIMER_IMPORT], ["    sleep(1)"]);

const METHOD_SOURCE = buildProgram(
	[DEVICE_IMPORT],
	["    const bus = getDevice()", "    bus.beginWrite(60)"],
);

const positionOf = (source, marker) => {
	const index = source.indexOf(marker);
	const before = source.slice(0, index);
	const lines = before.split("\n");
	return `${lines.length}:${lines[lines.length - 1].length + 1}`;
};

const collectErrors = (source) => {
	return checkSource(source, LIBRARIES).errors;
};

const errorsWithCode = (errors, code) => {
	return errors.filter((error) => {
		return error.code === code;
	});
};

const findError = (errors) => {
	return errors.find((error) => {
		return (error.severity ?? SEVERITY.error) === SEVERITY.error;
	});
};

const formatLocation = (diagnostic) => {
	const start = diagnostic?.location?.start;
	return start ? `${start.line}:${start.column}` : "?";
};

const checkCallTargetCase = (label, source, errorCode, marker) => {
	const errors = collectErrors(source);
	const diagnostics = errorsWithCode(errors, errorCode);
	const diagnostic = diagnostics[0];
	const message = diagnostic ? formatDiagnosticMessage(diagnostic) : "";
	return [
		expectEqual(
			`${label} used as a callee reports ${errorCode}`,
			diagnostics.length,
			1,
		),
		expectEqual(
			`the ${label} callee error points at the callee`,
			formatLocation(diagnostic),
			positionOf(source, CALLEE_LOCATION_MARKER[marker]),
		),
		expectEqual(
			`the ${label} callee error is not a warning`,
			diagnostic?.severity,
			SEVERITY.error,
		),
		expectEqual(
			`the ${label} callee error names the callee`,
			message.includes(`'${diagnostic?.params?.name}'`),
			true,
		),
	];
};

const checkIntegerCallee = () => {
	return checkCallTargetCase(
		"an integer",
		INTEGER_SOURCE,
		ERROR_CODE.callTargetNotCallable,
		"integer",
	);
};

const checkStringCallee = () => {
	return checkCallTargetCase(
		"a string",
		STRING_SOURCE,
		ERROR_CODE.callTargetNotCallable,
		"string",
	);
};

const checkBooleanCallee = () => {
	return checkCallTargetCase(
		"a boolean",
		BOOLEAN_SOURCE,
		ERROR_CODE.callTargetNotCallable,
		"boolean",
	);
};

const checkNominalObjectCallee = () => {
	return checkCallTargetCase(
		"a nominal object",
		NOMINAL_SOURCE,
		ERROR_CODE.callTargetNotCallable,
		"nominal",
	);
};

const checkAnonymousShapeCallee = () => {
	const results = checkCallTargetCase(
		"an anonymous shape",
		SHAPE_SOURCE,
		ERROR_CODE.callTargetNotCallable,
		"shape",
	);
	const [diagnostic] = errorsWithCode(
		collectErrors(SHAPE_SOURCE),
		ERROR_CODE.callTargetNotCallable,
	);
	results.push(
		expectEqual(
			"the shape callee error reports the encoded shape type",
			diagnostic?.params?.type,
			"object:{x:i8}",
		),
	);
	return results;
};

const checkEnumCallee = () => {
	const results = checkCallTargetCase(
		"an enum value",
		ENUM_SOURCE,
		ERROR_CODE.callTargetNotCallable,
		"enum",
	);
	const [diagnostic] = errorsWithCode(
		collectErrors(ENUM_SOURCE),
		ERROR_CODE.callTargetNotCallable,
	);
	results.push(
		expectEqual(
			"the enum callee error reports the enum type",
			diagnostic?.params?.type,
			"Level",
		),
	);
	return results;
};

const checkAsyncTaskCallee = () => {
	const results = checkCallTargetCase(
		"an AsyncTask",
		ASYNC_TASK_SOURCE,
		ERROR_CODE.asyncTaskCall,
		"asyncTask",
	);
	const [diagnostic] = errorsWithCode(
		collectErrors(ASYNC_TASK_SOURCE),
		ERROR_CODE.asyncTaskCall,
	);
	const message = diagnostic ? formatDiagnosticMessage(diagnostic) : "";
	results.push(
		expectEqual(
			"the AsyncTask call error tells the author to await",
			message.includes("await") &&
				message.includes("const value = await persona"),
			true,
		),
	);
	return results;
};

const checkLocalFunctionReferenceCallee = () => {
	const results = checkCallTargetCase(
		"a local function reference",
		LOCAL_REFERENCE_SOURCE,
		ERROR_CODE.functionReferenceCall,
		"localReference",
	);
	const [diagnostic] = errorsWithCode(
		collectErrors(LOCAL_REFERENCE_SOURCE),
		ERROR_CODE.functionReferenceCall,
	);
	const message = diagnostic ? formatDiagnosticMessage(diagnostic) : "";
	results.push(
		expectEqual(
			"the local function reference error names the original function",
			message.includes("Call 'getPersona' directly"),
			true,
		),
	);
	return results;
};

const checkLibraryFunctionReferenceCallee = () => {
	const results = checkCallTargetCase(
		"a library function reference",
		LIBRARY_REFERENCE_SOURCE,
		ERROR_CODE.functionReferenceCall,
		"libraryReference",
	);
	const [diagnostic] = errorsWithCode(
		collectErrors(LIBRARY_REFERENCE_SOURCE),
		ERROR_CODE.functionReferenceCall,
	);
	const message = diagnostic ? formatDiagnosticMessage(diagnostic) : "";
	results.push(
		expectEqual(
			"the library function reference error names the original function",
			message.includes("Call 'sleep' directly"),
			true,
		),
	);
	return results;
};

const checkNoErrorCase = (label, source) => {
	const errors = collectErrors(source);
	const diagnostic = findError(errors);
	return [
		expectEqual(
			`${label} reports no error diagnostic`,
			diagnostic?.code,
			undefined,
		),
	];
};

const checkCallbackParameterCallable = () => {
	return checkNoErrorCase(
		"calling a function-typed parameter",
		CALLBACK_PARAMETER_SOURCE,
	);
};

const checkLocalFunctionCall = () => {
	return checkNoErrorCase("calling a local function", LOCAL_FUNCTION_SOURCE);
};

const checkLibraryFunctionCall = () => {
	return checkNoErrorCase(
		"calling a library function",
		LIBRARY_FUNCTION_SOURCE,
	);
};

const checkMethodCall = () => {
	return checkNoErrorCase("calling a method", METHOD_SOURCE);
};

const writeProjectConfiguration = (projectDirectory) => {
	const configuration = {
		name: "arduino-nano",
		type: PROJECT_TYPE,
		platform: "arduino-nano",
		core: [],
		libraries: [],
	};
	mkdirSync(projectDirectory, { recursive: true });
	writeFileSync(
		join(projectDirectory, CONFIG_FILE),
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);
};

const BUILD_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const n = 1",
	"    const m = n()",
	"}",
	"main()",
].join("\n");

const runBuild = async (projectDirectory) => {
	try {
		await runProcess(
			NODE_EXECUTABLE,
			[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, "main.e95"],
			{
				cwd: projectDirectory,
				env: { ...process.env, INIT_CWD: projectDirectory },
				encoding: UTF8,
			},
		);
		return null;
	} catch (error) {
		return error;
	}
};

const checkBuildFailsBeforeCodegen = async () => {
	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), CALL_TARGET_TEMP_DIRECTORY_PREFIX),
	);
	const projectDirectory = join(temporaryDirectory, "arduino-nano");
	try {
		writeProjectConfiguration(projectDirectory);
		writeFileSync(join(projectDirectory, "main.e95"), BUILD_SOURCE, UTF8);
		const buildError = await runBuild(projectDirectory);
		const stderr = buildError?.stderr ?? "";
		return [
			expectEqual(
				"calling a non-callable variable fails the build",
				buildError !== null,
				true,
			),
			expectEqual(
				"the build reports the checker diagnostic instead of emitting C++",
				stderr.includes("Cannot call 'n'"),
				true,
			),
			expectEqual(
				"the failed build writes no artifact",
				existsSync(join(projectDirectory, BUILD_DIRECTORY_NAME)),
				false,
			),
		];
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};

export const runCallTargetChecks = async () => {
	return [
		...checkIntegerCallee(),
		...checkStringCallee(),
		...checkBooleanCallee(),
		...checkNominalObjectCallee(),
		...checkAnonymousShapeCallee(),
		...checkEnumCallee(),
		...checkAsyncTaskCallee(),
		...checkLocalFunctionReferenceCallee(),
		...checkLibraryFunctionReferenceCallee(),
		...checkCallbackParameterCallable(),
		...checkLocalFunctionCall(),
		...checkLibraryFunctionCall(),
		...checkMethodCall(),
		...(await checkBuildFailsBeforeCodegen()),
	];
};
