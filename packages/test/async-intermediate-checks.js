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
import { dirname, join } from "node:path";
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
	loadLocalModules,
	loadProjectEngine,
	loadProjectLibraries,
	mergeModuleLibraries,
	PROJECT_TYPE,
	parse,
	resolvePlatformTypes,
	shared,
	tokenize,
	UTF8,
} from "embedito95-core";
import { isEntryDocument } from "../lsp/src/server/shared/libraries.js";
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

// The child task slot is an optional `_AsyncTaskItem` handle. Once the parent
// has read the child's value and marked it CONSUMED it must reset the field to
// a null handle, otherwise the child stays alive until the parent dies.
const CHILD_TASK_TYPE = "mod_async_task::_AsyncTaskItem";
const CHILD_RELEASE_SUFFIX = ` = nullable<core_object::Object<${CHILD_TASK_TYPE}>>{ true, core_object::Object<${CHILD_TASK_TYPE}>::null() };`;

const childReleaseLine = (fieldName) => {
	return `task->${fieldName}${CHILD_RELEASE_SUFFIX}`;
};

const childConsumedLine = (fieldName) => {
	return `task->${fieldName}.value->status = mod_async_task::_AsyncTaskStatus::CONSUMED;`;
};

// Asserts the final C++ resets the child handle AFTER marking it CONSUMED, so
// the value read just before stays valid (the parent keeps its own copy).
const checkChildReleasedAfterConsumed = (main, label, fieldName) => {
	const releaseIndex = main.indexOf(childReleaseLine(fieldName));
	const consumedIndex = main.indexOf(childConsumedLine(fieldName));
	return [
		expectEqual(
			`${label}: final main releases the child task handle`,
			releaseIndex !== -1,
			true,
		),
		expectEqual(
			`${label}: child handle is released after the value is consumed`,
			consumedIndex !== -1 && releaseIndex > consumedIndex,
			true,
		),
	];
};

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

const ASYNC_OBJECT_RETURN_SOURCE = [
	READ_VALUE_TASK_SOURCE,
	"const getPersona = async () => {",
	"    await readValue()",
	'    return { name: "David", age: 31 }',
	"}",
	"const probe = (value: string) => {",
	"    return value",
	"}",
	"const asyncTest = async () => {",
	"    const persona = await getPersona()",
	"    const first = persona.name",
	"    const second = persona.name",
	"    probe(first)",
	"    probe(second)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const ASYNC_RETURN_ALIAS_COLLISION_SOURCE = [
	"type _getPersonaReturn = { label: string }",
	"type getPersonaReturn = { label: string }",
	READ_VALUE_TASK_SOURCE,
	"const getPersona = async () => {",
	"    await readValue()",
	'    return { name: "David", age: 31 }',
	"}",
	"const probe = (value: string) => {",
	"    return value",
	"}",
	"const asyncTest = async () => {",
	"    const persona = await getPersona()",
	"    probe(persona.name)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const ASYNC_NOMINAL_RETURN_SOURCE = [
	"type Persona = { name: string, age: i8 }",
	"const getPersona = async (): Persona => {",
	'    return { name: "David", age: 31 }',
	"}",
	READ_VALUE_TASK_SOURCE,
	"const probe = (value: string) => {",
	"    return value",
	"}",
	"const asyncTest = async () => {",
	"    const persona = await getPersona()",
	"    probe(persona.name)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const ASYNC_SCALAR_RETURN_SOURCE = [
	"const readCount = async (): u8 => {",
	"    return 7",
	"}",
	"const asyncTest = async () => {",
	"    const value = await readCount()",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

const MIXED_RETURN_SOURCE = [
	READ_VALUE_TASK_SOURCE,
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	"const getPersonaRemote = async () => {",
	"    await readValue()",
	'    return { name: "David", age: 31 }',
	"}",
	"const probe = (value: string) => {",
	"    return value",
	"}",
	"const syncTest = async () => {",
	"    const persona = getPersona()",
	"    probe(persona.name)",
	"}",
	"const asyncTest = async () => {",
	"    const persona = await getPersonaRemote()",
	"    probe(persona.name)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    syncTest()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

// A sync helper's inferred return shape is synthesized as `_<helper>Return`.
// The `_` prefix is what keeps it apart from user types: without it, a user type
// named `getPersonaReturn` and the shape struct collide and the generated `.ino`
// declares the same `struct` twice.
const SYNC_RETURN_COLLISION_SOURCE = [
	"type getPersonaReturn = { x: i32 }",
	"const probeString = (value: string) => {",
	"    return value",
	"}",
	"const probeInteger = (value: i32) => {",
	"    return value",
	"}",
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probeString(persona.name)",
	"    const q: getPersonaReturn = { x: 1 }",
	"    probeInteger(q.x)",
	"}",
	"main()",
].join("\n");

const SYNC_RETURN_NAMES_SOURCE = [
	"const probeString = (value: string) => {",
	"    return value",
	"}",
	"const probeInteger = (value: i32) => {",
	"    return value",
	"}",
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probeString(persona.name)",
	"    const point = { x: 1, y: 2 }",
	"    probeInteger(point.x)",
	"}",
	"main()",
].join("\n");

const SYNC_RETURN_PREFIX_COLLISION_SOURCE = [
	"type _getPersonaReturn = { label: string }",
	"const probeString = (value: string) => {",
	"    return value",
	"}",
	"const getPersona = () => {",
	'    return { name: "David", age: 31 }',
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probeString(persona.name)",
	'    const q: _getPersonaReturn = { label: "x" }',
	"    probeString(q.label)",
	"}",
	"main()",
].join("\n");

const SYNC_RETURN_SHAPE_VARIANTS_SOURCE = [
	"type Personas = { items: object:{name:string;age:i8}[] }",
	"const probeInteger = (value: i8) => {",
	"    return value",
	"}",
	"const readShape = (enabled: boolean) => {",
	"    if (enabled) {",
	"        return { x: 1, y: 2 }",
	"    }",
	"    return null",
	"}",
	"const makeNested = () => {",
	"    const origin = { x: 1, y: 2 }",
	"    return { origin: origin, w: 10 }",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const shape = readShape(true)",
	"    if (shape != null) {",
	"        probeInteger(shape.x)",
	"    }",
	"    const personas: Personas = { items: [] }",
	"    probeInteger(personas.items[0].age)",
	"    const nested = makeNested()",
	"    probeInteger(nested.origin.x)",
	"}",
	"main()",
].join("\n");

// released right after the child is marked CONSUMED.
const ASYNC_BARE_AWAIT_SOURCE = [
	"const readCount = async (): u8 => {",
	"    return 7",
	"}",
	"const asyncTest = async () => {",
	"    await readCount()",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    asyncTest()",
	"}",
	"main()",
].join("\n");

// Regression: chained expression awaits. Each awaited child gets its own slot
// and is released after its value is copied into the parent task.
const ASYNC_CHAINED_AWAIT_SOURCE = [
	"const readFirst = async (): u8 => {",
	"    return 1",
	"}",
	"const readSecond = async (): u8 => {",
	"    return 2",
	"}",
	"const asyncTest = async () => {",
	"    const first = await readFirst()",
	"    const second = await readSecond()",
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

const findTaskTypeMembers = (source, typeName = TASK_TYPE_NAME) => {
	const { ast } = parseSource(source);
	for (const statement of ast.body) {
		if (
			statement.type === AST_NODE.typeDeclaration &&
			statement.name === typeName
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
	const { variableTypes, userFunctionReturnTypes, errors } = check(ast, {
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
		{
			...buildLibraryFunctionReturnTypes(libraries?.libraryFunctions ?? {}),
			...Object.fromEntries(userFunctionReturnTypes ?? []),
		},
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

const checkAsyncObjectReturnIntermediate = () => {
	const main = buildIntermediateMain(ASYNC_OBJECT_RETURN_SOURCE) ?? "";
	const payload = membersToMap(
		findTaskTypeMembers(main, "_GetPersonaAsyncTask"),
	);
	const parent = membersToMap(findTaskTypeMembers(main, TASK_TYPE_NAME));
	return [
		expectEqual(
			"async object return: payload uses the named return type",
			payload.value,
			"_getPersonaReturn",
		),
		expectEqual(
			"async object return: awaited local uses the named return type",
			parent.persona,
			"_getPersonaReturn",
		),
		expectEqual(
			"async object return: parent keeps the await child task field",
			Boolean(parent.childGetPersona),
			true,
		),
	];
};

const checkAsyncNominalReturnIntermediate = () => {
	const main = buildIntermediateMain(ASYNC_NOMINAL_RETURN_SOURCE) ?? "";
	const payload = membersToMap(
		findTaskTypeMembers(main, "_GetPersonaAsyncTask"),
	);
	return expectEqual(
		"async nominal return: payload keeps the declared type",
		payload.value,
		"Persona",
	);
};

const checkAsyncScalarReturnIntermediate = () => {
	const main = buildIntermediateMain(ASYNC_SCALAR_RETURN_SOURCE) ?? "";
	const payload = membersToMap(
		findTaskTypeMembers(main, "_ReadCountAsyncTask"),
	);
	return expectEqual(
		"async scalar return: payload keeps the scalar type",
		payload.value,
		"u8",
	);
};

const checkMixedReturnAliasIntermediate = () => {
	const main = buildIntermediateMain(MIXED_RETURN_SOURCE) ?? "";
	const payload = membersToMap(
		findTaskTypeMembers(main, "_GetPersonaRemoteAsyncTask"),
	);
	const syncParent = membersToMap(
		findTaskTypeMembers(main, "_SyncTestAsyncTask"),
	);
	const asyncParent = membersToMap(findTaskTypeMembers(main, TASK_TYPE_NAME));
	return [
		expectEqual(
			"mixed return: async payload uses the shared alias",
			payload.value,
			"_getPersonaReturn",
		),
		expectEqual(
			"mixed return: sync-awaited field uses the shared alias",
			syncParent.persona,
			"_getPersonaReturn",
		),
		expectEqual(
			"mixed return: async-awaited field uses the shared alias",
			asyncParent.persona,
			"_getPersonaReturn",
		),
	];
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

const checkAsyncReturnBuildCase = async (
	projectDirectory,
	label,
	source,
	taskTypeName,
	payloadMember,
	expectedType,
	childFieldName,
) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, source);
	const buildError = await runBuild(projectDirectory);
	const intermediate = readIntermediateMain(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	const fields = membersToMap(findTaskTypeMembers(intermediate, taskTypeName));
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		...checkGeneratedMainStructure(projectDirectory, label, {
			beforeTask: [taskTypeName],
		}),
		...checkChildReleasedAfterConsumed(main, label, childFieldName),
		expectEqual(
			`intermediate types the async payload for ${label}`,
			fields[payloadMember],
			expectedType,
		),
		expectEqual(
			`final main declares the async payload for ${label}`,
			main.includes(`core_object::Object<${expectedType}> ${payloadMember};`),
			true,
		),
		expectEqual(
			`final main defaults the async payload without allocating for ${label}`,
			main.includes(`core_object::Object<${expectedType}>::null()`),
			true,
		),
		expectEqual(
			`final main has no empty object literal for ${label}`,
			main.includes('{ "", 0 }'),
			false,
		),
	];
};

const checkAsyncScalarReturnBuildCase = async (
	projectDirectory,
	label,
	source,
	childFieldName,
) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, source);
	const buildError = await runBuild(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		expectEqual(
			`final main keeps the scalar payload for ${label}`,
			main.includes("u8 value;"),
			true,
		),
		expectEqual(
			`final main does not allocate a payload handle for ${label}`,
			main.includes("core_object::Object<u8>"),
			false,
		),
		...checkChildReleasedAfterConsumed(main, label, childFieldName),
	];
};

const checkAsyncChainedAwaitBuildCase = async (projectDirectory) => {
	const label = "chained awaited children";
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, ASYNC_CHAINED_AWAIT_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		...checkChildReleasedAfterConsumed(main, label, "childReadFirst"),
		...checkChildReleasedAfterConsumed(main, label, "childReadSecond"),
	];
};

const checkMixedReturnBuildCase = async (projectDirectory) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, MIXED_RETURN_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const intermediate = readIntermediateMain(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	const syncParent = membersToMap(
		findTaskTypeMembers(intermediate, "_SyncTestAsyncTask"),
	);
	const asyncParent = membersToMap(
		findTaskTypeMembers(intermediate, TASK_TYPE_NAME),
	);
	return [
		expectEqual(
			"build compiles for a mixed sync/async return",
			buildError,
			null,
		),
		expectEqual(
			"mixed return: sync-awaited field uses the shared alias",
			syncParent.persona,
			"_getPersonaReturn",
		),
		expectEqual(
			"mixed return: async-awaited field uses the shared alias",
			asyncParent.persona,
			"_getPersonaReturn",
		),
		expectEqual(
			"mixed return: sync helper returns the shared alias",
			main.includes("core_object::Object<_getPersonaReturn> getPersona()"),
			true,
		),
		expectEqual(
			"mixed return: no duplicate alias for the same shape",
			main.includes("_getPersonaRemoteReturn"),
			false,
		),
		expectEqual(
			"mixed return: alias is declared with the synthesized `_` prefix",
			main.includes("struct _getPersonaReturn"),
			true,
		),
		expectEqual(
			"mixed return: no unprefixed alias is generated",
			main.includes("Object<getPersonaReturn>"),
			false,
		),
	];
};

const countOccurrences = (source, text) => {
	return source.split(text).length - 1;
};

const checkSyncReturnCollisionBuildCase = async (projectDirectory) => {
	const label = "a user type colliding with a sync return shape";
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, SYNC_RETURN_COLLISION_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		expectEqual(
			"sync collision: the user type is declared exactly once",
			countOccurrences(main, "struct getPersonaReturn {"),
			1,
		),
		expectEqual(
			"sync collision: the inferred shape is synthesized with a `_` prefix",
			main.includes("struct _getPersonaReturn {"),
			true,
		),
		expectEqual(
			"sync collision: the helper returns the synthesized alias",
			main.includes("core_object::Object<_getPersonaReturn> getPersona()"),
			true,
		),
		expectEqual(
			"sync collision: no unprefixed alias is generated for the helper",
			main.includes("Object<getPersonaReturn> getPersona()"),
			false,
		),
		expectEqual(
			"sync collision: the user type stays usable",
			main.includes("core_object::Object<getPersonaReturn> q"),
			true,
		),
	];
};

const checkSyncReturnNamesBuildCase = async (projectDirectory) => {
	const label = "the default sync return names";
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, SYNC_RETURN_NAMES_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		expectEqual(
			"sync names: the helper return shape gets the `_` prefix",
			main.includes("struct _getPersonaReturn {"),
			true,
		),
		expectEqual(
			"sync names: no unprefixed helper return struct is emitted",
			main.includes("struct getPersonaReturn {"),
			false,
		),
		expectEqual(
			"sync names: main's own return shape gets the `_` prefix",
			main.includes("struct _mainReturn {"),
			true,
		),
		expectEqual(
			"sync names: no unprefixed main return struct is emitted",
			main.includes("struct mainReturn {"),
			false,
		),
	];
};

const checkSyncReturnPrefixCollisionBuildCase = async (projectDirectory) => {
	const label = "a user type already using the synthesized prefix";
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, SYNC_RETURN_PREFIX_COLLISION_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		expectEqual(
			"sync prefix collision: the user type keeps its declaration",
			main.includes("struct _getPersonaReturn {"),
			true,
		),
		expectEqual(
			"sync prefix collision: the synthesized alias takes a numeric suffix",
			main.includes("struct _getPersonaReturn1 {"),
			true,
		),
		expectEqual(
			"sync prefix collision: the helper returns the free alias",
			main.includes("core_object::Object<_getPersonaReturn1> getPersona()"),
			true,
		),
	];
};

const referencedHandlesHavePrefix = (main, structName) => {
	const names = collectReferencedStructNames(findStructBody(main, structName));
	return names.size > 0 && [...names].every((name) => name.startsWith("_"));
};

const checkSyncReturnShapeVariantsBuildCase = async (projectDirectory) => {
	const label = "nested, array and nullable sync return shapes";
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, SYNC_RETURN_SHAPE_VARIANTS_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		expectEqual(
			"sync variants: the nested return shape is synthesized with a `_` prefix",
			main.includes("struct _makeNestedReturn {"),
			true,
		),
		expectEqual(
			"sync variants: no unprefixed nested return struct is emitted",
			main.includes("struct makeNestedReturn {"),
			false,
		),
		expectEqual(
			"sync variants: the nested inner shape is synthesized with a `_` prefix",
			referencedHandlesHavePrefix(main, "_makeNestedReturn"),
			true,
		),
		expectEqual(
			"sync variants: the nullable return shape is synthesized with a `_` prefix",
			main.includes("struct _readShapeReturn {"),
			true,
		),
		expectEqual(
			"sync variants: the array element shape is referenced with a prefixed name",
			referencedHandlesHavePrefix(main, "Personas"),
			true,
		),
		expectEqual(
			"sync variants: the bare fallback name is not emitted",
			main.includes("struct AnonymousObject {"),
			false,
		),
	];
};

const checkAsyncReturnAliasCollisionBuildCase = async (projectDirectory) => {
	const label = "a user type colliding with the return alias";
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, ASYNC_RETURN_ALIAS_COLLISION_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const intermediate = readIntermediateMain(projectDirectory);
	const main = readBuiltMain(projectDirectory);
	const payload = membersToMap(
		findTaskTypeMembers(intermediate, "_GetPersonaAsyncTask"),
	);
	return [
		expectEqual(`build compiles for ${label}`, buildError, null),
		expectEqual(
			"collision: the inferred shape takes a free alias with the `_` prefix",
			payload.value,
			"_getPersonaReturn1",
		),
		expectEqual(
			"collision: the user type keeps its own declaration",
			main.includes("struct _getPersonaReturn {"),
			true,
		),
		expectEqual(
			"collision: the generated alias gets a numeric suffix",
			main.includes("struct _getPersonaReturn1 {"),
			true,
		),
		expectEqual(
			"collision: no unprefixed alias is generated",
			main.includes("Object<getPersonaReturn>"),
			false,
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

const intermediateDirectory = (projectDirectory) => {
	return join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		PROJECT_NAME,
		"intermediate",
	);
};

const readIntermediateSource = (projectDirectory, fileName) => {
	const path = join(intermediateDirectory(projectDirectory), fileName);
	return existsSync(path) ? readFileSync(path, UTF8) : "";
};

const describeDiagnostics = (diagnostics) => {
	return diagnostics
		.map((diagnostic) => {
			const line = diagnostic.location?.start?.line ?? "?";
			return `${diagnostic.code}@${line}`;
		})
		.join(", ");
};

// Re-checks the written intermediate exactly like `checkIntermediate` does:
// `isEntry: false` for both files, the project libraries plus the async module
// they import, and the real platform types. This is the same pipeline the
// editor uses once the generated files are classified as generated output.
const collectIntermediateDiagnostics = async (projectDirectory) => {
	const platform = await loadProjectEngine(projectDirectory);
	const wordSize = platform?.specs?.wordSize ?? 16;
	const platformTypes = resolvePlatformTypes(platform);
	const projectLibraries = loadProjectLibraries(projectDirectory);
	const mainPath = join(
		intermediateDirectory(projectDirectory),
		ENTRY_FILE_NAME,
	);
	const asyncPath = join(
		intermediateDirectory(projectDirectory),
		shared.ASYNC_INTERMEDIATE_FILE_NAME,
	);
	const mainLibraries = mergeModuleLibraries(
		projectLibraries,
		loadLocalModules(mainPath).entryLibraries,
	);
	const diagnosticsOf = (path, libraries) => {
		if (!existsSync(path)) {
			return [];
		}
		const source = readFileSync(path, UTF8);
		const { ast } = parse(tokenize(source).tokens);
		const { errors } = check(ast, {
			...libraries,
			isLibrary: false,
			isEntry: false,
			source,
			wordSize,
			platformTypes,
		});
		return errors;
	};
	return {
		main: diagnosticsOf(mainPath, mainLibraries),
		async: diagnosticsOf(asyncPath, projectLibraries),
		lspIsEntry: isEntryDocument(dirname(mainPath), mainPath),
	};
};

const checkIntermediateIsDiagnosticFree = async (projectDirectory, label) => {
	const result = await collectIntermediateDiagnostics(projectDirectory);
	return [
		expectEqual(
			`${label}: intermediate main has no diagnostics (${describeDiagnostics(result.main)})`,
			result.main.length,
			0,
		),
		expectEqual(
			`${label}: intermediate async module has no diagnostics (${describeDiagnostics(result.async)})`,
			result.async.length,
			0,
		),
		expectEqual(
			`${label}: the editor does not treat the generated intermediate as an entry`,
			result.lspIsEntry,
			false,
		),
	];
};

const checkInlinedSleepOutput = (projectDirectory) => {
	const main = readIntermediateSource(projectDirectory, ENTRY_FILE_NAME);
	const asyncModule = readIntermediateSource(
		projectDirectory,
		shared.ASYNC_INTERMEDIATE_FILE_NAME,
	);
	return [
		expectEqual(
			"inlined await sleep: no orphan _sleepAsyncAdd wrapper is emitted",
			asyncModule.includes("_sleepAsyncAdd"),
			false,
		),
		expectEqual(
			"inlined await sleep: the event-loop handler is still emitted",
			asyncModule.includes("_sleepAsyncHandler"),
			true,
		),
		expectEqual(
			"inlined await sleep: no stale enum member is left behind",
			main.includes("childSleepMilliseconds"),
			true,
		),
	];
};

const checkRealAwaitKeepsWrapper = (projectDirectory) => {
	const main = readIntermediateSource(projectDirectory, ENTRY_FILE_NAME);
	return [
		expectEqual(
			"real await: the add wrapper is still generated",
			main.includes("const _getPersonaAsyncAdd"),
			true,
		),
		expectEqual(
			"real await: the child task is created through the add wrapper",
			main.includes("_getPersonaAsyncAdd(true)"),
			true,
		),
	];
};

// The wrapper dead-code filter only prunes generated `_<name>AsyncAdd` helpers
// that no lowered call site references. A real (non-generated) unused function
// must still produce the warning.
const checkUnusedUserFunctionStillReported = () => {
	const source = [
		"const unusedHelper = () => {}",
		"const main = () => {}",
		"main()",
	].join("\n");
	const { ast } = parse(tokenize(source).tokens);
	const { errors } = check(ast, {
		isLibrary: false,
		isEntry: true,
		source,
		wordSize: 16,
	});
	const reported = errors.some((error) => {
		return (
			error.code === "error.unusedFunction" &&
			error.params?.name === "unusedHelper"
		);
	});
	return expectEqual(
		"unusedFunction still warns about a real unused user function",
		reported,
		true,
	);
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
			...checkAsyncObjectReturnIntermediate(),
			checkAsyncNominalReturnIntermediate(),
			checkAsyncScalarReturnIntermediate(),
			...checkMixedReturnAliasIntermediate(),
			...checkSleepIntermediate(libraries),
		];
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"an unused inferred-shape local",
				BASE_ASYNC_SOURCE,
				PERSONA_SHAPE_TYPE,
				{ beforeTask: ["_getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"an inferred-shape local read after await",
				USED_PERSONA_SOURCE,
				PERSONA_SHAPE_TYPE,
				{ beforeTask: ["_getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkBuildCase(
				projectDirectory,
				"a nested inferred shape",
				NESTED_SHAPE_SOURCE,
				NESTED_SHAPE_TYPE,
				{
					beforeTask: ["_getPersonaReturn"],
					nestedDependencies: ["_getPersonaReturn"],
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
				{ beforeTask: ["_getPersonaReturn"] },
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
			...(await checkAsyncReturnBuildCase(
				projectDirectory,
				"an async helper returning an inferred object",
				ASYNC_OBJECT_RETURN_SOURCE,
				"_GetPersonaAsyncTask",
				"value",
				"_getPersonaReturn",
				"childGetPersona",
			)),
		);
		results.push(
			...(await checkAsyncReturnBuildCase(
				projectDirectory,
				"an async helper returning a nominal object",
				ASYNC_NOMINAL_RETURN_SOURCE,
				"_GetPersonaAsyncTask",
				"value",
				"Persona",
				"childGetPersona",
			)),
		);
		results.push(
			...(await checkAsyncScalarReturnBuildCase(
				projectDirectory,
				"an async helper returning a scalar",
				ASYNC_SCALAR_RETURN_SOURCE,
				"childReadCount",
			)),
		);
		results.push(
			...(await checkAsyncScalarReturnBuildCase(
				projectDirectory,
				"a bare await without capturing the value",
				ASYNC_BARE_AWAIT_SOURCE,
				"childReadCount",
			)),
		);
		results.push(...(await checkAsyncChainedAwaitBuildCase(projectDirectory)));
		results.push(...(await checkMixedReturnBuildCase(projectDirectory)));
		results.push(
			...(await checkAsyncReturnAliasCollisionBuildCase(projectDirectory)),
		);
		results.push(
			...(await checkSyncReturnCollisionBuildCase(projectDirectory)),
		);
		results.push(...(await checkSyncReturnNamesBuildCase(projectDirectory)));
		results.push(
			...(await checkSyncReturnPrefixCollisionBuildCase(projectDirectory)),
		);
		results.push(
			...(await checkSyncReturnShapeVariantsBuildCase(projectDirectory)),
		);
		results.push(
			...(await checkSleepBuildCase(
				projectDirectory,
				"an inferred-shape local with awaited sleep",
				SLEEP_SOURCE,
				{ beforeTask: ["_getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkSleepBuildCase(
				projectDirectory,
				"an inferred-shape local read after awaited sleep",
				SLEEP_USED_PERSONA_SOURCE,
				{ beforeTask: ["_getPersonaReturn"] },
			)),
		);
		results.push(
			...(await checkIntermediateIsDiagnosticFree(
				projectDirectory,
				"an inferred-shape local read after awaited sleep",
			)),
		);
		results.push(...checkInlinedSleepOutput(projectDirectory));
		removeBuildDirectory(projectDirectory);
		writeEntry(projectDirectory, ASYNC_OBJECT_RETURN_SOURCE);
		const realAwaitBuildError = await runBuild(projectDirectory);
		results.push(
			expectEqual(
				"build compiles for a real awaited async helper",
				realAwaitBuildError,
				null,
			),
		);
		results.push(...checkRealAwaitKeepsWrapper(projectDirectory));
		results.push(
			...(await checkIntermediateIsDiagnosticFree(
				projectDirectory,
				"an async helper returning an inferred object",
			)),
		);
		results.push(checkUnusedUserFunctionStillReported());
		results.push(...(await checkIncrementalRebuild(projectDirectory)));
		return results;
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};
