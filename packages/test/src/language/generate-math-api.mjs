import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	collectLibraryModuleInfo,
	findDocCommentBefore,
	UTF8,
} from "embedito95-core";
import {
	CORE_LIBRARY_DIRECTORY,
	LIBRARY_DOCS_DIRECTORY,
	isMainModule,
	listSnapshotsIn,
	parseSource,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const MATH_PACKAGE = "@embedito95/math";
const CORE_DIRECTORY_NAME = "core";
const MATH_DIRECTORY_NAME = "math";
const MATH_LIBRARY_PATH = join(
	CORE_LIBRARY_DIRECTORY,
	MATH_DIRECTORY_NAME,
	"main.e95",
);
const MATH_DOCS_DIRECTORY = join(
	LIBRARY_DOCS_DIRECTORY,
	CORE_DIRECTORY_NAME,
);
const DOCUMENT_FILE_NAME = "math-api.md";
const DOCUMENT_TITLE = "# Math API reference";
const DOC_SUMMARY_LINE_PATTERN = /^\s*\*\s?(.*)$/;
const DOC_SUMMARY_IGNORED_PREFIX = "@";
const TABLE_PIPE = "|";
const TABLE_PIPE_ESCAPE = "\\|";
const SIGNATURE_SEPARATOR = ", ";
const CODE_FENCE = "```";
const REGENERATION_COMMAND = "pnpm run test:snapshot";
const DIRECT_COMMAND =
	"node packages/test/src/language/generate-math-api.mjs";

// Group order is presentation only: within a group every function keeps the
// order it has in `main.e95`. A new function must be added to a group, so the
// page never silently drops one or collects it in an "other" bucket.
const FUNCTION_GROUPS = [
	{
		title: "Integer range, clamping and magnitude",
		names: ["interpolateRange", "clamp", "absolute", "minimum", "maximum"],
	},
	{
		title: "Floating-point and trigonometry",
		names: [
			"interpolateRangeFloat",
			"clampFloat",
			"power",
			"squareRoot",
			"square",
			"naturalLog",
			"logarithm10",
			"exponential",
			"absoluteFloat",
			"minimumFloat",
			"maximumFloat",
			"roundDown",
			"roundUp",
			"roundNearest",
			"remainderFloat",
			"truncate",
			"sine",
			"cosine",
			"tangent",
			"arcSine",
			"arcCosine",
			"arcTangent",
			"arcTangent2",
			"toRadians",
			"toDegrees",
		],
	},
	{
		title: "Bit and byte helpers",
		names: [
			"readBitValue",
			"writeBitValue",
			"setBitValue",
			"clearBitValue",
			"lowByteValue",
			"highByteValue",
			"bitMask",
		],
	},
	{
		title: "Pseudo-random numbers",
		names: ["randomInteger", "seedRandom"],
	},
];

// A pipe inside a code span still splits a GFM table cell, so escape it.
const renderCode = (value) => {
	return `\`${value.replaceAll(TABLE_PIPE, TABLE_PIPE_ESCAPE)}\``;
};

const renderMarkdownRow = (cells) => {
	return `| ${cells.join(" | ")} |`;
};

const readDocSummary = (docComment) => {
	for (const line of docComment.split("\n")) {
		const match = line.match(DOC_SUMMARY_LINE_PATTERN);
		if (!match) {
			continue;
		}
		const text = match[1].trim();
		if (text.length === 0 || text.startsWith(DOC_SUMMARY_IGNORED_PREFIX)) {
			continue;
		}
		return text;
	}
	return null;
};

// The doc comment is read from the parsed AST, through the same lookup the
// library metadata uses, so the page shows the first line of the JSDoc that
// ships with the declaration.
const collectDocSummaries = (ast, comments) => {
	const summaries = new Map();

	for (const statement of ast.body) {
		const declaration = statement.declarations?.[0];
		const name = declaration?.id?.name;
		if (!name) {
			continue;
		}
		const docComment = findDocCommentBefore(
			comments,
			statement.loc.start.line,
		);
		summaries.set(name, docComment ? readDocSummary(docComment) : null);
	}

	return summaries;
};

const renderParameter = (parameter) => {
	return `${parameter.name}: ${parameter.type}`;
};

const renderSignature = (name, signature) => {
	const parameters = signature.params.map(renderParameter);
	return `${name}(${parameters.join(SIGNATURE_SEPARATOR)}): ${signature.returnType}`;
};

// The label of an expanded overload is the width the family resolved to, which
// is the type of its first parameter for every family in `main.e95`.
const renderOverloadWidth = (signature) => {
	const firstParameter = signature.params[0];
	return firstParameter ? firstParameter.type : signature.returnType;
};

const buildOverloadTable = (name, signatures) => {
	const lines = [
		renderMarkdownRow(["Width", "Signature"]),
		"| --- | --- |",
	];

	for (const signature of signatures) {
		lines.push(
			renderMarkdownRow([
				renderCode(renderOverloadWidth(signature)),
				renderCode(renderSignature(name, signature)),
			]),
		);
	}

	return lines.join("\n");
};

const buildFunctionSection = (name, definition, declaration, summary) => {
	const lines = [`### ${renderCode(name)}`, ""];
	const hasWidthFamily = definition.signatures.length > 1;

	if (summary) {
		lines.push(summary, "");
	}

	lines.push(
		hasWidthFamily
			? "Declared once with its width family:"
			: "Declared once with a fixed signature:",
		"",
		`${CODE_FENCE}e95`,
		renderSignature(name, declaration),
		CODE_FENCE,
	);

	if (hasWidthFamily) {
		lines.push(
			"",
			"Expanded to the concrete overloads the compiler type-checks:",
			"",
			buildOverloadTable(name, definition.signatures),
		);
	}

	return lines.join("\n");
};

const collectAssignedNames = () => {
	const assignedNames = new Set();

	for (const group of FUNCTION_GROUPS) {
		for (const name of group.names) {
			assignedNames.add(name);
		}
	}

	return assignedNames;
};

// Ensures the group table and `main.e95` agree in both directions: a new
// function forces a regeneration decision instead of leaving the page
// incomplete, and a removed function does not linger as a stale entry.
const assertGroupsMatchFunctions = (functions) => {
	const assignedNames = collectAssignedNames();

	for (const name of Object.keys(functions)) {
		if (!assignedNames.has(name)) {
			throw new Error(
				`math API generator: no group for "${name}" in FUNCTION_GROUPS`,
			);
		}
	}

	for (const name of assignedNames) {
		if (!functions[name]) {
			throw new Error(
				`math API generator: "${name}" is grouped but not declared in main.e95`,
			);
		}
	}
};

const buildGroupSection = (group, context) => {
	const lines = [`## ${group.title}`, ""];

	for (const name of group.names) {
		const definition = context.functions[name];
		const declaration = context.declarations[name];
		if (!definition) {
			continue;
		}
		lines.push(
			buildFunctionSection(
				name,
				definition,
				declaration,
				context.docSummaries.get(name),
			),
			"",
		);
	}

	return lines.join("\n");
};

const buildGroupSections = (context) => {
	const sections = [];

	for (const group of FUNCTION_GROUPS) {
		sections.push(buildGroupSection(group, context));
	}

	return sections.join("\n");
};

const buildRegenerationSection = () => {
	const lines = [
		"## Regeneration",
		"",
		"This page is written by",
		"`packages/test/src/language/generate-math-api.mjs` from",
		"`packages/registry/src/core/math/main.e95`. From the repository root:",
		"",
		`${CODE_FENCE}sh`,
		REGENERATION_COMMAND,
		CODE_FENCE,
		"",
		`\`pnpm run test\` compares the page with the generated content and fails`,
		"when the declaration and the page drift apart, so the page stays in sync",
		"with the library source. The generator can also be invoked directly:",
		"",
		`${CODE_FENCE}sh`,
		DIRECT_COMMAND,
		CODE_FENCE,
		"",
	];

	return lines.join("\n");
};

const readMathSource = () => {
	return readFileSync(MATH_LIBRARY_PATH, UTF8);
};

const buildDocument = () => {
	const source = readMathSource();
	const { ast, comments } = parseSource(source);
	const moduleInfo = collectLibraryModuleInfo(source, MATH_PACKAGE);
	const declarationInfo = collectLibraryModuleInfo(source, MATH_PACKAGE, {
		allowWidthFamilies: false,
	});
	assertGroupsMatchFunctions(moduleInfo.functions);
	const context = {
		functions: moduleInfo.functions,
		declarations: declarationInfo.functions,
		docSummaries: collectDocSummaries(ast, comments),
	};

	const lines = [
		DOCUMENT_TITLE,
		"",
		"This page lists every function of the `math` core library. Each one is",
		"declared once with a width family (`f32 | f64` or `i32 | i64 | u32`);",
		"the compiler expands that family into one concrete signature per width",
		"before type checking, and both forms are shown here together with the",
		"first line of the function's doc comment.",
		"",
		"The promotion rules and the width-selection table live in",
		"[Math](math.md); this page does not repeat them. Do not edit it by hand:",
		"regenerate it with the command in [Regeneration](#regeneration).",
		"",
		buildGroupSections(context),
		buildRegenerationSection(),
	];

	return lines.join("\n");
};

export const listMathApiSnapshots = () => {
	return listSnapshotsIn(MATH_DOCS_DIRECTORY, DOCUMENT_FILE_NAME, buildDocument());
};

export const writeMathApiSnapshots = () => {
	writeSnapshots(listMathApiSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeMathApiSnapshots();
	console.log(`Generated ${DOCUMENT_FILE_NAME}`);
}
