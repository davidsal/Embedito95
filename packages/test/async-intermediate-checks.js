// Regression for the async lowering of a local whose initializer is an
// inferred anonymous object shape (a helper with no `: Type` annotation). The
// task struct must keep its own fields and store the local as a SINGLE field
// typed with the shape, instead of letting the shape's `;`/`:` separators split
// `name`/`age` into extra task members (which broke both the intermediate
// re-check and the generated C++).
import { execFile } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	AST_NODE,
	BUILD_DIRECTORY_NAME,
	buildLibraryFunctionReturnTypes,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	check,
	ENTRY_OPTION,
	JSON_INDENTATION,
	loadProjectLibraries,
	PROJECT_TYPE,
	shared,
	UTF8,
} from "embedito95-core";
import {
	ASYNC_INTERMEDIATE_TEMP_DIRECTORY_PREFIX,
	BUILD_COMMAND,
	CLI_PATH,
	NODE_EXECUTABLE,
	REGISTRY_LIBRARIES_DIRECTORY,
} from "./constants.js";
import { expectEqual } from "./reporting.js";
import { parseSource } from "./src/language/language-snapshot-harness.mjs";

const runProcess = promisify(execFile);

const PROJECT_NAME = "arduino-nano";
const PLATFORM_NAME = "arduino-nano";
const ENTRY_FILE_NAME = "main.e95";
const TASK_TYPE_NAME = "_AsyncTestAsyncTask";
const PERSONA_SHAPE_TYPE = "object:{name:string;age:i8}";
const NESTED_SHAPE_TYPE =
	"object:{name:string;direccion:object:{ciudad:string}}";
const READ_VALUE_TASK_SOURCE = [
	"const readValue = async (): i16 => {",
	"    return 1",
	"}",
].join("\n");

const BASE_ASYNC_SOURCE = [
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	READ_VALUE_TASK_SOURCE,
	"const asyncTest = async () => {",
	"    const persona = getPersona()",
	"    await readValue()",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const USED_PERSONA_SOURCE = [
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	READ_VALUE_TASK_SOURCE,
	"const probe = (value: string) => {",
	"    return value",
	"}",
	"const asyncTest = async () => {",
	"    const persona = getPersona()",
	"    await readValue()",
	"    probe(persona.name)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probe(persona.name)",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const NESTED_SHAPE_SOURCE = [
	"const getPersona = () => {",
	'    return { name: "David", direccion: { ciudad: "Madrid" } }',
	"}",
	READ_VALUE_TASK_SOURCE,
	"const asyncTest = async () => {",
	"    const persona = getPersona()",
	"    await readValue()",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const NOMINAL_SOURCE = [
	"type Persona = { name: string, age: i8 }",
	"const getPersona = (): Persona => {",
	'    return { name: "David", age: 31 }',
	"}",
	READ_VALUE_TASK_SOURCE,
	"const asyncTest = async () => {",
	"    const persona = getPersona()",
	"    await readValue()",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const ARRAY_SHAPE_SOURCE = [
	"type Personas = { items: object:{name:string;age:i8}[] }",
	"const getPersonas = (): Personas => {",
	"    return { items: [] }",
	"}",
	READ_VALUE_TASK_SOURCE,
	"const asyncTest = async () => {",
	"    const personas = getPersonas()",
	"    await readValue()",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const INTERPOLATION_REGRESSION_SOURCE = [
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	"const probe = (value: string) => {",
	"    return value",
	"}",
	READ_VALUE_TASK_SOURCE,
	"const asyncTest = async () => {",
	"    const persona = getPersona()",
	"    await readValue()",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    const text = `${persona.name}`",
	"    probe(text)",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

// The core timers are inlined into the caller's task instead of spawning a
// child task, so `await sleep(ms)` must add `childSleepMilliseconds` /
// `childSleepStart` to the task. This is the literal symptom of the original
// bug: the inferred-shape split used to leave those fields undeclared.
const ASYNC_LIBRARY_PACKAGE = "@embedito95/async";
const TIME_LIBRARY_PACKAGE = "@embedito95/time";
const ASYNC_LIBRARY_DIRECTORY_NAME = "async";
const TIME_LIBRARY_DIRECTORY_NAME = "time";
const SLEEP_MILLISECONDS_FIELD = "childSleepMilliseconds";
const SLEEP_START_FIELD = "childSleepStart";

const SLEEP_SOURCE = [
	"import { sleep } from '@embedito95/async'",
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	"const asyncTest = async () => {",
	"    const persona = getPersona()",
	"    await sleep(1000)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const SLEEP_USED_PERSONA_SOURCE = [
	"import { sleep } from '@embedito95/async'",
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	"const probe = (value: string) => {",
	"    return value",
	"}",
	"const asyncTest = async () => {",
	"    const persona = getPersona()",
	"    await sleep(1000)",
	"    probe(persona.name)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probe(persona.name)",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const findTaskTypeMembers = (source) => {
	const { ast } = parseSource(source);
	for (const statement of ast.body) {
		if (
			statement.type === AST_NODE.typeDeclaration &&
			statement.name === TASK_TYPE_NAME
		) {
			return statement.members;
		}
	}
	return null;
};

const membersToMap = (members) => {
	const fields = {};
	for (const member of members ?? []) {
		fields[member.name] = member.returnType;
	}
	return fields;
};

const readBuiltMain = (projectDirectory) => {
	const path = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		PROJECT_NAME,
		`${PROJECT_NAME}.ino`,
	);
	return existsSync(path) ? readFileSync(path, UTF8) : "";
};

const STRUCT_OBJECT_PATTERN = /core_object::Object<([^>]+)>/g;

const findStructBody = (main, structName) => {
	const start = main.indexOf(`struct ${structName} {`);
	if (start === -1) {
		return "";
	}
	const end = main.indexOf("};", start);
	return end === -1 ? "" : main.slice(start, end);
};

const collectReferencedStructNames = (body) => {
	const names = new Set();
	for (const match of body.matchAll(STRUCT_OBJECT_PATTERN)) {
		names.add(match[1].replace(/^.*::/, ""));
	}
	return names;
};

// The FINAL `.ino` (not the intermediate) must declare every dependency before
// the struct that uses it, and emit the trace/TypeInfo of the shared task
// handle. A missing shape struct or a wrong order breaks the real C++ compile.
const checkGeneratedMainStructure = (projectDirectory, label, expectations) => {
	const main = readBuiltMain(projectDirectory);
	const taskIndex = main.indexOf(`struct ${TASK_TYPE_NAME}`);
	const results = [
		expectEqual(`${label}: final main is generated`, main.length > 0, true),
		expectEqual(
			`${label}: task trace function is emitted`,
			main.includes(`_e95Trace_${TASK_TYPE_NAME}`),
			true,
		),
		expectEqual(
			`${label}: task TypeInfo is emitted`,
			main.includes(`TypeInfoOf<${TASK_TYPE_NAME}>`),
			true,
		),
	];
	for (const structName of expectations.beforeTask ?? []) {
		const structIndex = main.indexOf(`struct ${structName}`);
		results.push(
			expectEqual(
				`${label}: ${structName} struct is emitted`,
				structIndex !== -1,
				true,
			),
		);
		results.push(
			expectEqual(
				`${label}: ${structName} is declared before ${TASK_TYPE_NAME}`,
				structIndex !== -1 && structIndex < taskIndex,
				true,
			),
		);
	}
	for (const owner of expectations.nestedDependencies ?? []) {
		const ownerIndex = main.indexOf(`struct ${owner} {`);
		const body = findStructBody(main, owner);
		for (const dependency of collectReferencedStructNames(body)) {
			const dependencyIndex = main.indexOf(`struct ${dependency} {`);
			// External/library types have no local `struct`; skip them.
			if (dependencyIndex === -1) {
				continue;
			}
			results.push(
				expectEqual(
					`${label}: ${dependency} is declared before ${owner}`,
					ownerIndex !== -1 && dependencyIndex < ownerIndex,
					true,
				),
			);
		}
	}
	for (const typeName of expectations.typeInfos ?? []) {
		results.push(
			expectEqual(
				`${label}: TypeInfo of ${typeName} is emitted`,
				main.includes(`TypeInfoOf<${typeName}>`),
				true,
			),
		);
	}
	return results;
};

const buildIntermediateMain = (
	source,
	{ libraries = null, librarySources = [] } = {},
) => {
	const { ast, comments } = parseSource(source);
	const { variableTypes, errors } = check(ast, {
		...(libraries ?? {}),
		isLibrary: false,
		comments,
		source,
		wordSize: 16,
	});
	if (errors.some((error) => error.severity === 0)) {
		return null;
	}
	const libraryTypeContext = libraries
		? {
				libraries,
				wordSize: 16,
				platformTypes: libraries.platformTypes,
			}
		: null;
	return shared.buildAsyncIntermediate(
		source,
		librarySources,
		buildLibraryFunctionReturnTypes(libraries?.libraryFunctions ?? {}),
		variableTypes,
		libraryTypeContext,
	).main;
};

// Unit level: the real intermediate generator must keep `persona` as one field
// and must not hoist the shape's own fields into the task struct.
const checkIntermediateKeepsShapeAsSingleField = () => {
	const main = buildIntermediateMain(BASE_ASYNC_SOURCE);
	const fields = membersToMap(findTaskTypeMembers(main ?? ""));
	return [
		expectEqual(
			"async task keeps its own child field",
			Boolean(fields.childReadValue),
			true,
		),
		expectEqual(
			"async task stores the inferred shape local as one field",
			fields.persona,
			PERSONA_SHAPE_TYPE,
		),
		expectEqual(
			"async task does not merge the shape fields 'name'/'age'",
			[fields.name, fields.age].filter(Boolean).length,
			0,
		),
	];
};

const checkNestedShapeIntermediate = () => {
	const main = buildIntermediateMain(NESTED_SHAPE_SOURCE);
	const fields = membersToMap(findTaskTypeMembers(main ?? ""));
	return expectEqual(
		"async task stores a nested inferred shape as one field",
		fields.persona,
		NESTED_SHAPE_TYPE,
	);
};

const checkNominalShapeIntermediate = () => {
	const main = buildIntermediateMain(NOMINAL_SOURCE);
	const fields = membersToMap(findTaskTypeMembers(main ?? ""));
	return expectEqual(
		"async task keeps a nominal local type unchanged",
		fields.persona,
		"Persona",
	);
};

const readAsyncLibrarySources = (libraries) => {
	return Object.values(libraries.librarySources ?? {}).map((sourcePath) => {
		return readFileSync(sourcePath, UTF8);
	});
};

const checkSleepIntermediate = (libraries) => {
	const main = buildIntermediateMain(SLEEP_SOURCE, {
		libraries,
		librarySources: readAsyncLibrarySources(libraries),
	});
	const fields = membersToMap(findTaskTypeMembers(main ?? ""));
	return [
		expectEqual(
			"async task keeps the inlined sleep duration field",
			fields[SLEEP_MILLISECONDS_FIELD],
			"u32",
		),
		expectEqual(
			"async task keeps the inlined sleep start field",
			fields[SLEEP_START_FIELD],
			"u32",
		),
		expectEqual(
			"async task still stores the inferred shape local as one field next to sleep",
			fields.persona,
			PERSONA_SHAPE_TYPE,
		),
		expectEqual(
			"async task does not merge the shape fields 'name'/'age' next to sleep",
			[fields.name, fields.age].filter(Boolean).length,
			0,
		),
	];
};

const writeProjectConfiguration = (projectDirectory, core = []) => {
	mkdirSync(projectDirectory, { recursive: true });
	const configuration = {
		name: PROJECT_NAME,
		type: PROJECT_TYPE,
		platform: PLATFORM_NAME,
		core,
		libraries: [],
	};
	writeFileSync(
		join(projectDirectory, CONFIG_FILE),
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);
};

// The real `@embedito95/async` library must be on disk for both the unit check
// (so `sleep` resolves to its async declaration) and the CLI build. `sleep`
// reads the clock through `@embedito95/time`, so its dependency is installed
// too. Copy the versioned registry sources instead of depending on the
// gitignored testers.
const installSleepCoreLibraries = (projectDirectory) => {
	for (const directoryName of [
		ASYNC_LIBRARY_DIRECTORY_NAME,
		TIME_LIBRARY_DIRECTORY_NAME,
	]) {
		cpSync(
			join(REGISTRY_LIBRARIES_DIRECTORY, directoryName),
			join(projectDirectory, CORE_LIBRARIES_DIRECTORY_NAME, directoryName),
			{ recursive: true },
		);
	}
};

const removeBuildDirectory = (projectDirectory) => {
	rmSync(join(projectDirectory, BUILD_DIRECTORY_NAME), {
		recursive: true,
		force: true,
	});
};

const writeEntry = (projectDirectory, source) => {
	writeFileSync(join(projectDirectory, ENTRY_FILE_NAME), source, UTF8);
};

const runBuild = async (projectDirectory) => {
	try {
		await runProcess(
			NODE_EXECUTABLE,
			[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, ENTRY_FILE_NAME],
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

const readIntermediateMain = (projectDirectory) => {
	const path = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		PROJECT_NAME,
		"intermediate",
		ENTRY_FILE_NAME,
	);
	return existsSync(path) ? readFileSync(path, UTF8) : "";
};

const checkBuildCase = async (
	projectDirectory,
	label,
	source,
	expectedType,
	expectations = {},
	fieldName = "persona",
) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, source);
	const buildError = await runBuild(projectDirectory);
	const intermediate = readIntermediateMain(projectDirectory);
	const fields = membersToMap(findTaskTypeMembers(intermediate));
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		...checkGeneratedMainStructure(projectDirectory, label, expectations),
		expectEqual(
			`intermediate keeps the task fields for ${label}`,
			Boolean(fields.childReadValue),
			true,
		),
		expectEqual(
			`intermediate types the local with its own type for ${label}`,
			fields[fieldName],
			expectedType,
		),
		expectEqual(
			`intermediate does not merge shape fields for ${label}`,
			[fields.name, fields.age].filter(Boolean).length,
			0,
		),
	];
};

const checkSleepBuildCase = async (
	projectDirectory,
	label,
	source,
	expectations = {},
) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, source);
	const buildError = await runBuild(projectDirectory);
	const intermediate = readIntermediateMain(projectDirectory);
	const fields = membersToMap(findTaskTypeMembers(intermediate));
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		...checkGeneratedMainStructure(projectDirectory, label, expectations),
		expectEqual(
			`intermediate keeps the inlined sleep duration field for ${label}`,
			fields[SLEEP_MILLISECONDS_FIELD],
			"u32",
		),
		expectEqual(
			`intermediate keeps the inlined sleep start field for ${label}`,
			fields[SLEEP_START_FIELD],
			"u32",
		),
		expectEqual(
			`intermediate types the local with its own type for ${label}`,
			fields.persona,
			PERSONA_SHAPE_TYPE,
		),
		expectEqual(
			`intermediate does not merge shape fields for ${label}`,
			[fields.name, fields.age].filter(Boolean).length,
			0,
		),
	];
};

const checkIncrementalRebuild = async (projectDirectory) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, BASE_ASYNC_SOURCE);
	const firstError = await runBuild(projectDirectory);
	const secondError = await runBuild(projectDirectory);
	return [
		expectEqual("clean build succeeds", firstError, null),
		expectEqual("rebuild over the previous output succeeds", secondError, null),
	];
};

export const runAsyncIntermediateChecks = async () => {
	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), ASYNC_INTERMEDIATE_TEMP_DIRECTORY_PREFIX),
	);
	const projectDirectory = join(temporaryDirectory, PROJECT_NAME);

	try {
		writeProjectConfiguration(projectDirectory, [
			ASYNC_LIBRARY_PACKAGE,
			TIME_LIBRARY_PACKAGE,
		]);
		installSleepCoreLibraries(projectDirectory);
		const libraries = loadProjectLibraries(projectDirectory);
		const results = [
			...checkIntermediateKeepsShapeAsSingleField(),
			checkNestedShapeIntermediate(),
			checkNominalShapeIntermediate(),
			...checkSleepIntermediate(libraries),
		];
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"an unused inferred-shape local",
				BASE_ASYNC_SOURCE,
				PERSONA_SHAPE_TYPE,
				{ beforeTask: ["getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"an inferred-shape local read after await",
				USED_PERSONA_SOURCE,
				PERSONA_SHAPE_TYPE,
				{ beforeTask: ["getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"a nested inferred shape",
				NESTED_SHAPE_SOURCE,
				NESTED_SHAPE_TYPE,
				{
					beforeTask: ["getPersonaReturn"],
					nestedDependencies: ["getPersonaReturn"],
				},
			)),
		);
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"a nominal annotated type",
				NOMINAL_SOURCE,
				"Persona",
				{ beforeTask: ["Persona"] },
			)),
		);
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"a template interpolation over the shape",
				INTERPOLATION_REGRESSION_SOURCE,
				PERSONA_SHAPE_TYPE,
				{ beforeTask: ["getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"an array of shapes in a named type",
				ARRAY_SHAPE_SOURCE,
				"Personas",
				{
					beforeTask: ["Personas"],
					nestedDependencies: ["Personas"],
					typeInfos: ["Personas"],
				},
				"personas",
			)),
		);
		results.push(
			...(await checkSleepBuildCase(
				projectDirectory,
				"an inferred-shape local with awaited sleep",
				SLEEP_SOURCE,
				{ beforeTask: ["getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkSleepBuildCase(
				projectDirectory,
				"an inferred-shape local read after awaited sleep",
				SLEEP_USED_PERSONA_SOURCE,
				{ beforeTask: ["getPersonaReturn"] },
			)),
		);
		results.push(...(await checkIncrementalRebuild(projectDirectory)));
		return results;
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};
