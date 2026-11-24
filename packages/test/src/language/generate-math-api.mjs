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
	listSnapshotAt,
	parseSource,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";
import {
	FUNCTION_GROUPS,
	buildDocumentPreamble,
	buildRegenerationSection,
} from "./math-api-content.mjs";
import {
	CODE_FENCE,
	renderCode,
	renderMarkdownRow,
	renderMarkdownSeparator,
} from "./markdown-rendering.mjs";

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
const DOC_SUMMARY_LINE_PATTERN = /^\s*\*\s?(.*)$/;
const DOC_SUMMARY_IGNORED_PREFIX = "@";
const SIGNATURE_SEPARATOR = ", ";
const E95_FENCE_LANGUAGE = "e95";
const GROUP_HEADING_PREFIX = "## ";
const FUNCTION_HEADING_PREFIX = "### ";
const OVERLOAD_COLUMN_TITLES = ["Width", "Signature"];
const WIDTH_FAMILY_DECLARATION_NOTE =
	"Declared once with its width family:";
const FIXED_SIGNATURE_DECLARATION_NOTE =
	"Declared once with a fixed signature:";
const OVERLOAD_TABLE_NOTE =
	"Expanded to the concrete overloads the compiler type-checks:";

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
		renderMarkdownRow(OVERLOAD_COLUMN_TITLES),
		renderMarkdownSeparator(OVERLOAD_COLUMN_TITLES.length),
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
	const lines = [`${FUNCTION_HEADING_PREFIX}${renderCode(name)}`, ""];
	const hasWidthFamily = definition.signatures.length > 1;

	if (summary) {
		lines.push(summary, "");
	}

	lines.push(
		hasWidthFamily
			? WIDTH_FAMILY_DECLARATION_NOTE
			: FIXED_SIGNATURE_DECLARATION_NOTE,
		"",
		`${CODE_FENCE}${E95_FENCE_LANGUAGE}`,
		renderSignature(name, declaration),
		CODE_FENCE,
	);

	if (hasWidthFamily) {
		lines.push(
			"",
			OVERLOAD_TABLE_NOTE,
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
export const assertGroupsMatchFunctions = (functions) => {
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
	const lines = [`${GROUP_HEADING_PREFIX}${group.title}`, ""];

	for (const name of group.names) {
		lines.push(
			buildFunctionSection(
				name,
				context.functions[name],
				context.declarations[name],
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

	return [
		buildDocumentPreamble(),
		buildGroupSections(context),
		buildRegenerationSection(),
	].join("\n");
};

export const listMathApiSnapshots = () => {
	return listSnapshotAt(MATH_DOCS_DIRECTORY, DOCUMENT_FILE_NAME, buildDocument());
};

export const writeMathApiSnapshots = () => {
	writeSnapshots(listMathApiSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeMathApiSnapshots();
	console.log(`Generated ${DOCUMENT_FILE_NAME}`);
}
