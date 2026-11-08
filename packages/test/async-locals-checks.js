import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	AST_NODE,
	buildLibraryFunctionReturnTypes,
	check,
	loadProjectLibraries,
	shared,
	UTF8,
} from "embedito95-core";
import { expectEqual } from "./reporting.js";
import { PACKAGE_DIRECTORY, TESTERS_DIRECTORY } from "./runner-harness.js";
import {
	createLibraries,
	parseSource,
} from "./src/language/language-snapshot-harness.mjs";

const FAKE_LIBRARY_PACKAGE = "@embedito95/fake";
const AVR_WORD_SIZE = 16;
const STM32_WORD_SIZE = 32;
const WORD_SIZE_EXPECTATIONS = [
	{ wordSize: AVR_WORD_SIZE, wordType: "i16" },
	{ wordSize: STM32_WORD_SIZE, wordType: "i32" },
];
// The generated `packages/test/testers/**` projects are gitignored, so a fresh
// checkout has no `main.e95` when the unit checks run. Prefer the real tester
// and fall back to the versioned copy of its async locals (same shape, no
// annotations) instead of skipping the case.
const TESTER_MAIN_PATH = join(TESTERS_DIRECTORY, "main.e95");
const ASYNC_LOCALS_FIXTURE_PATH = join(
	PACKAGE_DIRECTORY,
	"fixtures",
	"async-locals",
	"main.e95",
);
const FADE_LOCAL_NAMES = ["value", "step"];
const ANIMATE_FACE_LOCAL_NAMES = ["step"];

const INFERRED_INITIALIZER_SOURCE = [
	`import { makeDevice } from '${FAKE_LIBRARY_PACKAGE}'`,
	"const STEP_SIZE = 1",
	"const readStep = async (): i16 => {",
	"    return STEP_SIZE",
	"}",
	"const run = async () => {",
	"    const device = makeDevice()",
	"    let literal = 0",
	"    let constant = STEP_SIZE",
	"    let sum = literal + constant",
	"    let reading = device.transfer(7)",
	"    let awaited = await readStep()",
	"    let annotated: u8 = 0",
	"    literal = literal + sum",
	"    constant = constant + reading",
	"    awaited = awaited + literal",
	"    annotated = annotated + 1",
	"}",
].join("\n");

// An async function declared inside an imported library is lowered by the same
// machinery as an entry one, so its hoisted locals must use the same target
// word type. `value` is inferred (no annotation) and would regress to `i32` if
// the library source were checked without the target word size.
const LIBRARY_ASYNC_SOURCE = [
	"export const readLibraryValue = async (): i16 => {",
	"    let value = 0",
	"    value = value + 1",
	"    return value",
	"}",
].join("\n");

const LIBRARY_ASYNC_ENTRY_SOURCE = [
	`import { readLibraryValue } from '${FAKE_LIBRARY_PACKAGE}'`,
	"const run = async () => {",
	"    let awaited = await readLibraryValue()",
	"    awaited = awaited + 1",
	"}",
].join("\n");

const createFakeLibraries = () => {
	return createLibraries({
		knownLibraries: new Set([FAKE_LIBRARY_PACKAGE]),
		libraryExports: {
			[FAKE_LIBRARY_PACKAGE]: new Set(["makeDevice", "readLibraryValue"]),
		},
		libraryFunctions: {
			[FAKE_LIBRARY_PACKAGE]: {
				makeDevice: { params: [], returnType: "Device" },
				readLibraryValue: { params: [], returnType: "i16" },
			},
		},
		libraryObjectTypes: {
			[FAKE_LIBRARY_PACKAGE]: {
				Device: {
					methods: {
						transfer: { params: [], returnType: "u8" },
					},
					fields: {},
				},
			},
		},
	});
};

const resolveTesterMainPath = () => {
	return existsSync(TESTER_MAIN_PATH)
		? TESTER_MAIN_PATH
		: ASYNC_LOCALS_FIXTURE_PATH;
};

const collectVariableTypes = (source, libraries, wordSize) => {
	const { ast, comments } = parseSource(source);
	const { variableTypes } = check(ast, {
		...libraries,
		isLibrary: false,
		comments,
		source,
		wordSize,
	});
	return variableTypes;
};

const buildLibraryTypeContext = (libraries, wordSize) => {
	return {
		libraries,
		wordSize,
		platformTypes: libraries.platformTypes,
	};
};

const collectTypeFields = (source, typeName) => {
	const { ast } = parseSource(source);
	const declaration = ast.body.find((statement) => {
		return (
			statement.type === AST_NODE.typeDeclaration && statement.name === typeName
		);
	});
	const fields = {};
	for (const member of declaration?.members ?? []) {
		if (member.kind === "method") {
			continue;
		}
		fields[member.name] = member.returnType;
	}
	return fields;
};

const buildTaskTypeFields = ({
	entrySource,
	libraries,
	wordSize,
	typeName,
	librarySources = [],
	libraryTypeContext = null,
}) => {
	const variableTypes = collectVariableTypes(entrySource, libraries, wordSize);
	const intermediate = shared.buildAsyncIntermediate(
		entrySource,
		librarySources,
		buildLibraryFunctionReturnTypes(libraries.libraryFunctions),
		variableTypes,
		libraryTypeContext,
	);
	const moduleSource =
		intermediate.main.includes(`type ${typeName}`) || !intermediate.async
			? intermediate.main
			: intermediate.async;
	return collectTypeFields(moduleSource, typeName);
};

const formatFields = (fields, names) => {
	return names
		.map((name) => {
			return `${name}: ${fields[name]}`;
		})
		.join(", ");
};

const checkTesterMainFields = ({ wordSize, wordType }) => {
	const sourcePath = resolveTesterMainPath();
	const source = readFileSync(sourcePath, UTF8);
	const libraries = loadProjectLibraries(dirname(sourcePath));
	const fadeFields = buildTaskTypeFields({
		entrySource: source,
		libraries,
		wordSize,
		typeName: "_FadeAsyncTask",
	});
	const animateFields = buildTaskTypeFields({
		entrySource: source,
		libraries,
		wordSize,
		typeName: "_AnimateFaceAsyncTask",
	});
	return [
		expectEqual(
			`async hoists tester main fade locals with inferred ${wordType} types (word size ${wordSize})`,
			formatFields(fadeFields, FADE_LOCAL_NAMES),
			`value: ${wordType}, step: ${wordType}`,
		),
		expectEqual(
			`async hoists tester main animate-face loop local with inferred ${wordType} type (word size ${wordSize})`,
			formatFields(animateFields, ANIMATE_FACE_LOCAL_NAMES),
			`step: ${wordType}`,
		),
	];
};

const checkInferredInitializerFields = ({ wordSize, wordType }) => {
	const libraries = createFakeLibraries();
	const fields = buildTaskTypeFields({
		entrySource: INFERRED_INITIALIZER_SOURCE,
		libraries,
		wordSize,
		typeName: "_RunAsyncTask",
	});
	return expectEqual(
		`async hoists literal, binary, library-method, await, user-return and annotated locals with inferred types (word size ${wordSize})`,
		formatFields(fields, [
			"literal",
			"constant",
			"sum",
			"reading",
			"awaited",
			"annotated",
		]),
		`literal: ${wordType}, constant: ${wordType}, sum: ${wordType}, reading: ${wordType}, awaited: ${wordType}, annotated: u8`,
	);
};

const checkLibraryAsyncFields = ({ wordSize, wordType }) => {
	const libraries = createFakeLibraries();
	const fields = buildTaskTypeFields({
		entrySource: LIBRARY_ASYNC_ENTRY_SOURCE,
		libraries,
		wordSize,
		typeName: "_ReadLibraryValueAsyncTask",
		librarySources: [LIBRARY_ASYNC_SOURCE],
		libraryTypeContext: buildLibraryTypeContext(libraries, wordSize),
	});
	return expectEqual(
		`async library tasks hoist locals with inferred ${wordType} type (word size ${wordSize})`,
		formatFields(fields, ["value"]),
		`value: ${wordType}`,
	);
};

export const runAsyncLocalChecks = () => {
	return WORD_SIZE_EXPECTATIONS.flatMap(({ wordSize, wordType }) => {
		return [
			...checkTesterMainFields({ wordSize, wordType }),
			checkInferredInitializerFields({ wordSize, wordType }),
			checkLibraryAsyncFields({ wordSize, wordType }),
		];
	});
};
