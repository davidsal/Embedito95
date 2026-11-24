// End-to-end guard for template-literal interpolation at the build pipeline
// level. Before this fix the checker was the only barrier, so a pipeline that
// skipped it could generate invalid C++ such as
// `core_string::String a = (core_string::String({  }));` for `${persona}` or
// `core_string::String({ 1, 2 })` for `${[1, 2]}`. This check builds a real
// project with the CLI (no `arduino-cli` involved) and verifies that the build
// fails before writing any artifact, and that a valid primitive interpolation
// still writes an artifact containing `core_string::String(...)`.
import { execFile } from "node:child_process";
import {
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
	CONFIG_FILE,
	ENTRY_OPTION,
	JSON_INDENTATION,
	PROJECT_TYPE,
	parse,
	tokenize,
	UTF8,
	walk,
} from "embedito95-core";
import { renderTemplateLiteral } from "../core/src/strategy-shared/render-delegates.js";
import {
	BUILD_COMMAND,
	CLI_PATH,
	NODE_EXECUTABLE,
	TEMPLATE_CODEGEN_GUARD_TEMP_DIRECTORY_PREFIX,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

const runProcess = promisify(execFile);

const PROJECT_NAME = "arduino-nano";
const PLATFORM_NAME = "arduino-nano";
const ENTRY_FILE_NAME = "main.e95";
const ARTIFACT_EXTENSION = ".ino";
const INVALID_CONFIGURATION_MESSAGE = "Cannot interpolate a value of type";
const VALID_INTERPOLATIONS = [
	"core_string::String(nombre)",
	"core_string::String(contador)",
	"core_string::String(ratio)",
];

const INVALID_CASES = [
	{
		label: "a nominal object",
		expectedType: "Persona",
		source: [
			"type Persona = { name: string, age: i32 }",
			'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const persona = getPersona()",
			"    const texto = `${persona}`",
			"}",
			"main()",
		].join("\n"),
	},
	{
		label: "an array variable",
		expectedType: "i32[]",
		source: [
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const lista: i32[] = [1, 2]",
			"    const texto = `${lista}`",
			"}",
			"main()",
		].join("\n"),
	},
	{
		label: "an array literal",
		expectedType: "array",
		source: [
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const texto = `${[]}`",
			"}",
			"main()",
		].join("\n"),
	},
];

const VALID_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	'    const nombre: string = "ana"',
	"    const contador: i32 = 1",
	"    const ratio: f32 = 1.5",
	"    const texto = `${nombre}-${contador}-${ratio}`",
	"}",
	"main()",
].join("\n");

const GUARD_SOURCE = [
	"type Persona = { name: string, age: i32 }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = 1",
	"    const lista = 1",
	"    const primero = `${persona}`",
	"    const segundo = `${lista}`",
	"    const tercero = `${[]}`",
	"}",
].join("\n");

const GUARD_TYPE_BY_NAME = {
	persona: "Persona",
	lista: "i32[]",
};

const GUARD_RENDER_CONTEXT = {
	ast: { body: [] },
	enumNames: new Set(),
	renderStringLiteral: (value) => {
		return `"${value}"`;
	},
	resolveNameType: (name) => {
		return GUARD_TYPE_BY_NAME[name] ?? null;
	},
};

// The renderer is a second line of defense. Before this guard the strategy
// happily emitted `core_string::String({  })` for `${persona}` and
// `core_string::String({ 1, 2 })` for `${[1, 2]}`; both are invalid C++ because
// there is no matching `core_string::String` overload. Calling the strategy
// directly must fail in a controlled way instead of producing that code.
const collectGuardFailures = (source) => {
	const { tokens } = tokenize(source);
	const { ast } = parse(tokens);
	const failures = [];
	walk(ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.templateLiteral) {
				return;
			}
			try {
				const rendered = renderTemplateLiteral(node, GUARD_RENDER_CONTEXT, []);
				failures.push(`rendered:${rendered}`);
			} catch (error) {
				failures.push(`${error.name}:${error.type}:${error.message}`);
			}
		},
	});
	return failures;
};

const checkCodegenGuardRejectsUnconvertible = () => {
	const failures = collectGuardFailures(GUARD_SOURCE);
	const expectedTypes = ["Persona", "i32[]", "array"];
	return [
		expectEqual(
			"the codegen guard rejects objects, arrays and compound literals",
			failures
				.map((failure) => {
					return failure.split(":")[1];
				})
				.join("|"),
			expectedTypes.join("|"),
		),
		expectEqual(
			"the codegen guard always reports a controlled error",
			failures.every((failure) => {
				return failure.startsWith("UnconvertibleTemplateExpressionError:");
			}),
			true,
		),
		expectEqual(
			"the codegen guard explains the missing String overload",
			failures.every((failure) => {
				return failure.includes("no core_string::String overload");
			}),
			true,
		),
	];
};

const writeProjectConfiguration = (projectDirectory) => {
	// No `embedito95Version` field: the CLI then runs the current build instead
	// of delegating to a published version (and no network is needed).
	const configuration = {
		name: PROJECT_NAME,
		type: PROJECT_TYPE,
		platform: PLATFORM_NAME,
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

const writeEntry = (projectDirectory, source) => {
	writeFileSync(join(projectDirectory, ENTRY_FILE_NAME), source, UTF8);
};

const removeBuildDirectory = (projectDirectory) => {
	rmSync(join(projectDirectory, BUILD_DIRECTORY_NAME), {
		recursive: true,
		force: true,
	});
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

const artifactPath = (projectDirectory) => {
	return join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		PROJECT_NAME,
		`${PROJECT_NAME}${ARTIFACT_EXTENSION}`,
	);
};

const checkInvalidInterpolationStopsBuild = async (
	projectDirectory,
	testCase,
) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, testCase.source);
	const buildError = await runBuild(projectDirectory);
	const stderr = buildError?.stderr ?? "";
	return [
		expectEqual(`build fails for ${testCase.label}`, buildError !== null, true),
		expectEqual(
			`build reports the unconvertible ${testCase.label} instead of emitting C++`,
			stderr.includes(
				`${INVALID_CONFIGURATION_MESSAGE} '${testCase.expectedType}'`,
			),
			true,
		),
		expectEqual(
			`build writes no artifact for ${testCase.label}`,
			existsSync(join(projectDirectory, BUILD_DIRECTORY_NAME)),
			false,
		),
	];
};

const checkValidInterpolationBuildsArtifact = async (projectDirectory) => {
	removeBuildDirectory(projectDirectory);
	writeEntry(projectDirectory, VALID_SOURCE);
	const buildError = await runBuild(projectDirectory);
	const outputPath = artifactPath(projectDirectory);
	const artifact = existsSync(outputPath) ? readFileSync(outputPath, UTF8) : "";
	return [
		expectEqual(
			"a valid primitive template literal builds successfully",
			buildError,
			null,
		),
		expectEqual(
			"a valid primitive template literal writes the platform artifact",
			existsSync(outputPath),
			true,
		),
		expectEqual(
			"every primitive interpolation still emits core_string::String(...)",
			VALID_INTERPOLATIONS.every((fragment) => {
				return artifact.includes(fragment);
			}),
			true,
		),
	];
};

export const runTemplateCodegenGuardChecks = async () => {
	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), TEMPLATE_CODEGEN_GUARD_TEMP_DIRECTORY_PREFIX),
	);
	const projectDirectory = join(temporaryDirectory, PROJECT_NAME);

	try {
		writeProjectConfiguration(projectDirectory);
		const results = [...checkCodegenGuardRejectsUnconvertible()];
		for (const testCase of INVALID_CASES) {
			results.push(
				...(await checkInvalidInterpolationStopsBuild(
					projectDirectory,
					testCase,
				)),
			);
		}
		results.push(
			...(await checkValidInterpolationBuildsArtifact(projectDirectory)),
		);
		return results;
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};
