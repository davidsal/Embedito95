import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	ENTRY_OPTION,
	ERROR_CODE,
	formatDiagnosticMessage,
	JSON_INDENTATION,
	PROJECT_TYPE,
	parse,
	tokenize,
	UTF8,
} from "embedito95-core";
import { ASYNC_TASK_DECLARATION } from "./async-task-type-parser-checks.js";
import { BUILD_COMMAND, CLI_PATH, NODE_EXECUTABLE } from "./constants.js";
import { expectEqual } from "./reporting.js";
import { withTemporaryDirectory } from "./runner-harness.js";
import {
	checkSource,
	createLibraries,
	hasErrorCode,
} from "./src/language/language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const PERSONA_DECLARATIONS = [
	"type Persona = { name: string, age: i32 }",
	'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
	"const probandoTexto = (value: string) => {}",
	"const probandoEdad = (value: i32) => {}",
];

const FAKE_DEVICE_LIBRARY = "@embedito95/fake-device";
const DEVICE_LIBRARIES = createLibraries({
	knownLibraries: new Set([FAKE_DEVICE_LIBRARY]),
	libraryExports: {
		[FAKE_DEVICE_LIBRARY]: new Set(["getDevice"]),
	},
	libraryFunctions: {
		[FAKE_DEVICE_LIBRARY]: {
			getDevice: { params: [], returnType: "Device" },
		},
	},
	libraryObjectTypes: {
		[FAKE_DEVICE_LIBRARY]: {
			Device: {
				fields: {
					speed: { type: "u16" },
				},
				methods: {},
			},
		},
	},
});

const ANONYMOUS_PERSONA_DECLARATIONS = [
	'const getAnonymousPersona = () => { return { name: "david", age: 31, address: { city: "Madrid" } } }',
	"const probandoTexto = (value: string) => {}",
	"const probandoEdad = (value: i32) => {}",
];

const buildPersonaSource = (bodyLines) => {
	return [
		...PERSONA_DECLARATIONS,
		"const main = () => {",
		"    const persona = getPersona()",
		...bodyLines,
		"}",
	].join("\n");
};

const checkPersonaBody = (bodyLines) => {
	return checkSource(buildPersonaSource(bodyLines), LIBRARIES).errors;
};

const checkAnonymousPersonaBody = (bodyLines) => {
	const source = [
		...ANONYMOUS_PERSONA_DECLARATIONS,
		"const main = () => {",
		"    const persona = getAnonymousPersona()",
		...bodyLines,
		"}",
	].join("\n");
	return checkSource(source, LIBRARIES).errors;
};

const parseForChecks = (source) => {
	const { tokens } = tokenize(source);
	return parse(tokens);
};

const memberPropertyName = (memberExpression) => {
	return memberExpression?.property?.name;
};

const diagnosticPosition = (diagnostic) => {
	return `${diagnostic?.location?.start?.line}:${diagnostic?.location?.start?.column}`;
};

const findUnknownMember = (errors) => {
	return errors.find((error) => {
		return error.code === ERROR_CODE.unknownMember;
	});
};

const checkUnknownArgumentMember = () => {
	const unknownName = checkPersonaBody(["    probandoTexto(persona.nom)"]);
	const nullName = checkPersonaBody(["    probandoTexto(persona.null)"]);
	const unknownError = findUnknownMember(unknownName);
	return [
		expectEqual(
			"unknown object property used as an argument reports unknownMember",
			hasErrorCode(unknownName, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"unknownMember keeps the property name and receiver type",
			`${unknownError?.params?.name}:${unknownError?.params?.type}`,
			"nom:Persona",
		),
		expectEqual(
			"unknownMember points at the property, not the receiver",
			`${unknownError?.location?.start?.line}:${unknownError?.location?.start?.column}`,
			"7:27",
		),
		expectEqual(
			"a missing property named null reports unknownMember",
			hasErrorCode(nullName, ERROR_CODE.unknownMember),
			true,
		),
	];
};

const checkKnownObjectMembers = () => {
	const errors = checkPersonaBody([
		"    probandoTexto(persona.name)",
		"    probandoEdad(persona.age)",
		`    probandoTexto(\`\${persona.name}\`)`,
	]);
	return expectEqual(
		"declared object fields do not report unknownMember",
		hasErrorCode(errors, ERROR_CODE.unknownMember),
		false,
	);
};

const checkUnknownMemberInOtherPositions = () => {
	const bareAccess = checkPersonaBody(["    persona.nom"]);
	const initializer = checkPersonaBody(["    const value: i32 = persona.nom"]);
	return [
		expectEqual(
			"a bare unknown property access reports unknownMember",
			hasErrorCode(bareAccess, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"an unknown property in an initializer reports unknownMember",
			hasErrorCode(initializer, ERROR_CODE.unknownMember),
			true,
		),
	];
};

const checkDanglingMemberAccess = () => {
	const danglingStatement = checkPersonaBody(["    persona."]);
	const danglingInitializer = checkPersonaBody(["    const nombre = persona."]);
	return [
		expectEqual(
			"a dangling member statement still reports expectedStatement",
			hasErrorCode(danglingStatement, ERROR_CODE.expectedStatement),
			true,
		),
		expectEqual(
			"a dangling member statement does not invent unknownMember",
			hasErrorCode(danglingStatement, ERROR_CODE.unknownMember),
			false,
		),
		expectEqual(
			"a dangling member initializer does not break the checker",
			Array.isArray(danglingInitializer),
			true,
		),
	];
};

const checkDanglingMemberSyntaxErrors = () => {
	const templateResult = parseForChecks(`const a = \`\${persona.}\``);
	const statementResult = parseForChecks(
		["const nombre = persona.", "const otro = 1"].join("\n"),
	);
	const eofResult = parseForChecks("persona.");
	return [
		expectEqual(
			"a dangling member inside a template reports a syntax error at the dot",
			`${templateResult.errors[0]?.code}@${diagnosticPosition(templateResult.errors[0])}`,
			`${ERROR_CODE.unexpectedToken}@1:21`,
		),
		expectEqual(
			"a dangling template keeps the dot and does not consume another token",
			memberPropertyName(
				templateResult.ast.body[0].declarations[0].init.expressions[0],
			),
			"",
		),
		expectEqual(
			"a dangling initializer before another statement reports a syntax error at the dot",
			`${statementResult.errors[0]?.code}@${diagnosticPosition(statementResult.errors[0])}`,
			`${ERROR_CODE.unexpectedToken}@1:23`,
		),
		expectEqual(
			"the statement after a dangling initializer is parsed separately",
			`${statementResult.ast.body.length}:${statementResult.ast.body[1]?.declarations[0]?.id?.name}`,
			"2:otro",
		),
		expectEqual(
			"a dangling initializer does not take the next statement keyword as a member",
			memberPropertyName(statementResult.ast.body[0].declarations[0].init),
			"",
		),
		expectEqual(
			"a dangling member at EOF reports a syntax error at the dot",
			`${eofResult.errors[0]?.code}@${diagnosticPosition(eofResult.errors[0])}`,
			`${ERROR_CODE.unexpectedToken}@1:8`,
		),
	];
};

const checkValidMemberChainsParseCleanly = () => {
	const sources = [
		"const a = persona.name",
		"const a = a.b.c",
		`const a = \`\${persona.name}\``,
	];
	const errorCounts = sources.map((source) => {
		return parseForChecks(source).errors.length;
	});
	return expectEqual(
		"valid member access chains parse without diagnostics",
		errorCounts.join(","),
		"0,0,0",
	);
};

const checkAnonymousShapeUnknownMember = () => {
	const argumentErrors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.noExiste)",
	]);
	const initializerErrors = checkAnonymousPersonaBody([
		"    const nombre = persona.noExiste",
	]);
	const bareErrors = checkAnonymousPersonaBody(["    persona.noExiste"]);
	const unknownError = findUnknownMember(argumentErrors);
	return [
		expectEqual(
			"an unknown property of an anonymous shape reports unknownMember as an argument",
			hasErrorCode(argumentErrors, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"anonymous shape unknownMember keeps the property name",
			unknownError?.params?.name,
			"noExiste",
		),
		expectEqual(
			"anonymous shape unknownMember reports the shape type",
			typeof unknownError?.params?.type === "string" &&
				unknownError.params.type.startsWith("object:"),
			true,
		),
		expectEqual(
			"anonymous shape unknownMember points at the property",
			`${unknownError?.location?.start?.line}:${unknownError?.location?.start?.column}`,
			"6:27",
		),
		expectEqual(
			"an unknown anonymous shape property in an initializer reports unknownMember",
			hasErrorCode(initializerErrors, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"a bare unknown anonymous shape property reports unknownMember",
			hasErrorCode(bareErrors, ERROR_CODE.unknownMember),
			true,
		),
	];
};

const checkAnonymousShapeKnownMembers = () => {
	const errors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.name)",
		"    probandoEdad(persona.age)",
	]);
	return expectEqual(
		"declared anonymous shape fields do not report unknownMember",
		hasErrorCode(errors, ERROR_CODE.unknownMember),
		false,
	);
};

const checkAnonymousShapeDanglingMemberAccess = () => {
	const danglingStatement = checkAnonymousPersonaBody(["    persona."]);
	const danglingInitializer = checkAnonymousPersonaBody([
		"    const nombre = persona.",
	]);
	const danglingTemplate = checkAnonymousPersonaBody([
		`    probandoTexto(\`\${persona.}\`)`,
	]);
	return [
		expectEqual(
			"a dangling anonymous shape member statement reports expectedStatement",
			hasErrorCode(danglingStatement, ERROR_CODE.expectedStatement),
			true,
		),
		expectEqual(
			"a dangling anonymous shape member statement does not invent unknownMember",
			hasErrorCode(danglingStatement, ERROR_CODE.unknownMember),
			false,
		),
		expectEqual(
			"a dangling anonymous shape member initializer does not break the checker",
			Array.isArray(danglingInitializer) &&
				!hasErrorCode(danglingInitializer, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"a dangling anonymous shape member inside a template does not invent unknownMember",
			hasErrorCode(danglingTemplate, ERROR_CODE.unknownMember),
			false,
		),
	];
};

const checkAnonymousShapeNestedMembers = () => {
	const validErrors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.address.city)",
	]);
	const invalidErrors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.address.zip)",
	]);
	const unknownError = findUnknownMember(invalidErrors);
	return [
		expectEqual(
			"a nested anonymous shape field does not report unknownMember",
			hasErrorCode(validErrors, ERROR_CODE.unknownMember),
			false,
		),
		expectEqual(
			"an unknown nested anonymous shape field reports unknownMember",
			unknownError?.params?.name,
			"zip",
		),
	];
};

const checkLibraryObjectMembers = () => {
	const source = [
		`import { getDevice } from '${FAKE_DEVICE_LIBRARY}'`,
		"const main = () => {",
		"    const device = getDevice()",
		"    const speed: u16 = device.speed",
		"    const bad: u16 = device.wrong",
		"}",
	].join("\n");
	const errors = checkSource(source, DEVICE_LIBRARIES).errors;
	const unknownError = findUnknownMember(errors);
	return [
		expectEqual(
			"an unknown member of a library object type reports unknownMember",
			hasErrorCode(errors, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"the library unknownMember keeps the library type",
			unknownError?.params?.type,
			"Device",
		),
		expectEqual(
			"declared library object fields do not report unknownMember",
			errors.filter((error) => {
				return (
					error.code === ERROR_CODE.unknownMember &&
					error.params?.name === "speed"
				);
			}).length,
			0,
		),
	];
};

const ASYNC_TASK_FIXTURE_LINES = [
	ASYNC_TASK_DECLARATION,
	'const getPersona = async () => { return { name: "David", age: 31 } }',
	"const noopAsync = async () => {}",
	"type Persona = { name: string, age: i32 }",
	"const acceptPersona = (value: Persona) => { return value.name }",
];

const NOMINAL_PERSONA_ASYNC_LINE =
	'const getNominalPersona = async (): Persona => { return { name: "David", age: 31 } }';
const CONSUME_TASK_LINE =
	"const consumeTask = (task: AsyncTask<Persona>) => { return task }";

const buildAsyncTaskSource = (bodyLines, extraLines = []) => {
	return [
		...ASYNC_TASK_FIXTURE_LINES,
		...extraLines,
		"const test = async () => {",
		...bodyLines,
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    test()",
		"}",
		"main()",
	].join("\n");
};

const checkAsyncTaskBody = (bodyLines, extraLines = []) => {
	return checkSource(buildAsyncTaskSource(bodyLines, extraLines), LIBRARIES)
		.errors;
};

const findAsyncTaskMemberAccess = (errors) => {
	return errors.find((error) => {
		return error.code === ERROR_CODE.asyncTaskMemberAccess;
	});
};

const checkAsyncTaskMemberAccessOnMissingAwait = () => {
	const errors = checkAsyncTaskBody([
		"    const persona = getPersona()",
		"    const name = persona.name",
		"    name",
	]);
	const diagnostic = findAsyncTaskMemberAccess(errors);
	return [
		expectEqual(
			"a member on an un-awaited AsyncTask reports asyncTaskMemberAccess",
			hasErrorCode(errors, ERROR_CODE.asyncTaskMemberAccess),
			true,
		),
		expectEqual(
			"asyncTaskMemberAccess keeps the property name",
			diagnostic?.params?.name,
			"name",
		),
		expectEqual(
			"asyncTaskMemberAccess reports the AsyncTask wrapper type",
			typeof diagnostic?.params?.type === "string" &&
				diagnostic.params.type.startsWith("AsyncTask<object:"),
			true,
		),
		expectEqual(
			"asyncTaskMemberAccess points at the property, not the receiver",
			`${diagnostic?.location?.start?.line}:${diagnostic?.location?.start?.column}`,
			"11:26",
		),
		expectEqual(
			"asyncTaskMemberAccess suggests awaiting the async call in its message",
			diagnostic
				? formatDiagnosticMessage(diagnostic).includes(
						"const value = await getResult()",
					)
				: false,
			true,
		),
		expectEqual(
			"the missing-await access does not fall back to unknownMember",
			hasErrorCode(errors, ERROR_CODE.unknownMember),
			false,
		),
	];
};

const checkAsyncTaskUnknownMemberAndAwaitControl = () => {
	const missingAwaitErrors = checkAsyncTaskBody([
		"    const persona = getPersona()",
		"    const name = persona.nom",
		"    name",
	]);
	const awaitedErrors = checkAsyncTaskBody([
		"    const persona = await getPersona()",
		"    const name = persona.nom",
		"    name",
	]);
	const awaitedDiagnostic = findUnknownMember(awaitedErrors);
	const asyncTaskDiagnostic = findAsyncTaskMemberAccess(missingAwaitErrors);
	return [
		expectEqual(
			"an unknown property on an un-awaited AsyncTask reports the AsyncTask error first",
			`${asyncTaskDiagnostic?.params?.name}:${typeof asyncTaskDiagnostic?.params?.type === "string" && asyncTaskDiagnostic.params.type.startsWith("AsyncTask<")}`,
			"nom:true",
		),
		expectEqual(
			"asyncTaskMemberAccess does not also report unknownMember",
			hasErrorCode(missingAwaitErrors, ERROR_CODE.unknownMember),
			false,
		),
		expectEqual(
			"after await an unknown property reports the regular unknownMember",
			`${awaitedDiagnostic?.params?.name}:${hasErrorCode(awaitedErrors, ERROR_CODE.asyncTaskMemberAccess)}`,
			"nom:false",
		),
	];
};

const checkAsyncTaskWrappedFieldAccess = () => {
	const errors = checkAsyncTaskBody([
		"    const persona = getPersona()",
		"    const done = persona.completed",
		"    const value = persona.value",
		"    done",
		"    value",
	]);
	return expectEqual(
		"the public AsyncTask fields completed and value stay accessible",
		[
			hasErrorCode(errors, ERROR_CODE.asyncTaskMemberAccess),
			hasErrorCode(errors, ERROR_CODE.unknownMember),
			hasErrorCode(errors, ERROR_CODE.invalidMemberAccess),
		].join(":"),
		"false:false:false",
	);
};

const checkAsyncTaskNegativeCases = () => {
	const awaitedTaskErrors = checkAsyncTaskBody([
		"    const persona = getPersona()",
		"    const payload = await persona",
		"    payload",
	]);
	const awaitedFieldErrors = checkAsyncTaskBody([
		"    const persona = getPersona()",
		"    const name = (await persona).name",
		"    name",
	]);
	const emptyTaskErrors = checkAsyncTaskBody([
		"    const task = noopAsync()",
		"    task",
	]);
	const awaitedCallErrors = checkAsyncTaskBody(["    await getPersona()"]);
	return [
		expectEqual(
			"the checker accepts awaiting an AsyncTask value (lowering of 'await <variable>' is tracked as pre-existing debt)",
			hasErrorCode(awaitedTaskErrors, ERROR_CODE.asyncTaskMemberAccess),
			false,
		),
		expectEqual(
			"the checker resolves a member on an awaited AsyncTask through the payload type (checker coverage only)",
			[
				hasErrorCode(awaitedFieldErrors, ERROR_CODE.asyncTaskMemberAccess),
				hasErrorCode(awaitedFieldErrors, ERROR_CODE.unknownMember),
			].join(":"),
			"false:false",
		),
		expectEqual(
			"an AsyncTask void value without member access is accepted",
			hasErrorCode(emptyTaskErrors, ERROR_CODE.asyncTaskMemberAccess),
			false,
		),
		expectEqual(
			"awaiting an async call without capturing it is accepted",
			hasErrorCode(awaitedCallErrors, ERROR_CODE.asyncTaskMemberAccess),
			false,
		),
	];
};

const findAsyncTaskArgument = (errors) => {
	return errors.find((error) => {
		return error.code === ERROR_CODE.asyncTaskArgument;
	});
};

const checkAsyncTaskArgumentAgainstShape = (errors) => {
	const diagnostic = findAsyncTaskArgument(errors);
	return [
		expectEqual(
			"passing an un-awaited AsyncTask to a payload parameter reports asyncTaskArgument",
			Boolean(diagnostic),
			true,
		),
		expectEqual(
			"asyncTaskArgument keeps the parameter name",
			diagnostic?.params?.name,
			"value",
		),
		expectEqual(
			"asyncTaskArgument keeps the expected payload type",
			diagnostic?.params?.expected,
			"Persona",
		),
		expectEqual(
			"asyncTaskArgument reports the anonymous shape task type",
			typeof diagnostic?.params?.actual === "string" &&
				diagnostic.params.actual.startsWith("AsyncTask<object:"),
			true,
		),
		expectEqual(
			"asyncTaskArgument points at the argument, not the callee",
			`${diagnostic?.location?.start?.line}:${diagnostic?.location?.start?.column}`,
			"11:19",
		),
		expectEqual(
			"asyncTaskArgument suggests awaiting the async call in its message",
			diagnostic
				? formatDiagnosticMessage(diagnostic).includes(
						"consume(await getValue())",
					)
				: false,
			true,
		),
		expectEqual(
			"the AsyncTask argument does not also report argumentTypeMismatch",
			hasErrorCode(errors, ERROR_CODE.argumentTypeMismatch),
			false,
		),
		expectEqual(
			"the AsyncTask argument does not also report asyncTaskMemberAccess",
			hasErrorCode(errors, ERROR_CODE.asyncTaskMemberAccess),
			false,
		),
	];
};

const checkAsyncTaskArgumentAgainstNominalType = () => {
	const errors = checkAsyncTaskBody(
		["    const persona = getNominalPersona()", "    acceptPersona(persona)"],
		[NOMINAL_PERSONA_ASYNC_LINE],
	);
	const diagnostic = findAsyncTaskArgument(errors);
	return [
		expectEqual(
			"passing a nominal AsyncTask<Persona> to a Persona parameter reports asyncTaskArgument",
			`${diagnostic?.params?.expected}:${diagnostic?.params?.actual}`,
			"Persona:AsyncTask<Persona>",
		),
		expectEqual(
			"the nominal AsyncTask argument points at the source argument",
			`${diagnostic?.location?.start?.line}:${diagnostic?.location?.start?.column}`,
			"12:19",
		),
	];
};

const checkAsyncTaskArgumentAcceptedByTaskParameter = () => {
	const errors = checkAsyncTaskBody(
		["    const persona = getPersona()", "    consumeTask(persona)"],
		[CONSUME_TASK_LINE],
	);
	return [
		expectEqual(
			"passing an AsyncTask to an AsyncTask parameter is accepted",
			hasErrorCode(errors, ERROR_CODE.asyncTaskArgument),
			false,
		),
		expectEqual(
			"the AsyncTask parameter case does not report argumentTypeMismatch",
			hasErrorCode(errors, ERROR_CODE.argumentTypeMismatch),
			false,
		),
	];
};

const CLI_ASYNC_TASK_ARGUMENT_SOURCE = [
	ASYNC_TASK_DECLARATION,
	'const getPersona = async () => { return { name: "David", age: 31 } }',
	"type Persona = { name: string, age: i32 }",
	"const acceptPersona = (value: Persona) => { return value.name }",
	"const test = async () => {",
	"    const persona = getPersona()",
	"    acceptPersona(persona)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    test()",
	"}",
	"main()",
].join("\n");

const CLI_PROJECT_NAME = "arduino-nano";
const CLI_ENTRY_FILE_NAME = "main.e95";
const INTERMEDIATE_DIRECTORY_NAME = "intermediate";

const CLI_ASYNC_TASK_AWAITED_CALL_SOURCE = [
	ASYNC_TASK_DECLARATION,
	'const getPersona = async () => { return { name: "David", age: 31 } }',
	"type Persona = { name: string, age: i32 }",
	"const showText = (value: string) => { return value }",
	"const test = async () => {",
	"    const persona = await getPersona()",
	"    showText(persona.name)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    test()",
	"}",
	"main()",
].join("\n");

const runBuildCapturingFailure = (projectDirectory) => {
	try {
		execFileSync(
			NODE_EXECUTABLE,
			[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, CLI_ENTRY_FILE_NAME],
			{
				cwd: projectDirectory,
				env: { ...process.env, INIT_CWD: projectDirectory },
				encoding: UTF8,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		return { status: 0, stderr: "" };
	} catch (error) {
		return { status: error.status, stderr: error.stderr ?? "" };
	}
};

const writeAsyncTaskProject = (projectDirectory, source) => {
	writeFileSync(join(projectDirectory, CLI_ENTRY_FILE_NAME), source, UTF8);
	writeFileSync(
		join(projectDirectory, CONFIG_FILE),
		`${JSON.stringify(
			{
				name: CLI_PROJECT_NAME,
				type: PROJECT_TYPE,
				platform: CLI_PROJECT_NAME,
				core: [],
				libraries: [],
			},
			null,
			JSON_INDENTATION,
		)}\n`,
		UTF8,
	);
};

const resolveIntermediatePath = (projectDirectory) => {
	return join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		CLI_PROJECT_NAME,
		INTERMEDIATE_DIRECTORY_NAME,
		CLI_ENTRY_FILE_NAME,
	);
};

const checkAsyncTaskArgumentStopsBuildAtSource = () => {
	return withTemporaryDirectory(
		"embedito95-async-task-argument-",
		(temporaryDirectory) => {
			writeAsyncTaskProject(temporaryDirectory, CLI_ASYNC_TASK_ARGUMENT_SOURCE);
			const build = runBuildCapturingFailure(temporaryDirectory);
			const intermediatePath = resolveIntermediatePath(temporaryDirectory);
			return [
				expectEqual(
					"the CLI build fails on the un-awaited AsyncTask argument",
					build.status === 0,
					false,
				),
				expectEqual(
					"the CLI build reports the error at the source argument",
					build.stderr.includes("main.e95:10:19"),
					true,
				),
				expectEqual(
					"the CLI build does not report the intermediate path",
					build.stderr.includes("intermediate/main.e95"),
					false,
				),
				expectEqual(
					"the CLI build stops before writing the intermediate",
					existsSync(intermediatePath),
					false,
				),
			];
		},
	);
};

const checkAsyncTaskAwaitedCallBuilds = () => {
	return withTemporaryDirectory(
		"embedito95-async-task-awaited-call-",
		(temporaryDirectory) => {
			writeAsyncTaskProject(
				temporaryDirectory,
				CLI_ASYNC_TASK_AWAITED_CALL_SOURCE,
			);
			const build = runBuildCapturingFailure(temporaryDirectory);
			const intermediatePath = resolveIntermediatePath(temporaryDirectory);
			return [
				expectEqual(
					"the CLI build accepts awaiting the async call before using the result",
					build.status,
					0,
				),
				expectEqual(
					"the awaited-call remediation does not fail on the intermediate",
					build.stderr.includes("intermediate/main.e95"),
					false,
				),
				expectEqual(
					"the awaited-call remediation writes the intermediate",
					existsSync(intermediatePath),
					true,
				),
			];
		},
	);
};

const checkAsyncTaskPassedToFunction = () => {
	const errors = checkAsyncTaskBody([
		"    const persona = getPersona()",
		"    acceptPersona(persona)",
	]);
	return [
		...checkAsyncTaskArgumentAgainstShape(errors),
		...checkAsyncTaskArgumentAgainstNominalType(),
		...checkAsyncTaskArgumentAcceptedByTaskParameter(),
		...checkAsyncTaskArgumentStopsBuildAtSource(),
	];
};

export const runMemberAccessChecks = () => {
	return [
		...checkUnknownArgumentMember(),
		checkKnownObjectMembers(),
		...checkUnknownMemberInOtherPositions(),
		...checkDanglingMemberAccess(),
		...checkDanglingMemberSyntaxErrors(),
		checkValidMemberChainsParseCleanly(),
		...checkAnonymousShapeUnknownMember(),
		checkAnonymousShapeKnownMembers(),
		...checkAnonymousShapeDanglingMemberAccess(),
		...checkAnonymousShapeNestedMembers(),
		...checkLibraryObjectMembers(),
		...checkAsyncTaskMemberAccessOnMissingAwait(),
		...checkAsyncTaskUnknownMemberAndAwaitControl(),
		checkAsyncTaskWrappedFieldAccess(),
		...checkAsyncTaskNegativeCases(),
		...checkAsyncTaskPassedToFunction(),
		...checkAsyncTaskAwaitedCallBuilds(),
	];
};
