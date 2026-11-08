// Shared harness for the `generate-*.mjs` language snapshot writers. Each
// generator only contributes its header text, its cases and the way it turns
// the `check()` output into report lines; the path resolution, the
// tokenize/parse/check pipeline and the snapshot listing/writing live here.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	AST_NODE,
	buildLibraryFunctionReturnTypes,
	check,
	collectLibraryModuleInfo,
	collectObjectLiteralTypes,
	DEFAULT_WORD_SIZE,
	formatDiagnosticMessage,
	parse,
	resolveProjectTypes,
	resolveReceiverType,
	resolveWordDataType,
	SEVERITY,
	tokenize,
	UTF8,
	walk,
} from "embedito95-core";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const LOCATION_END_TOLERANCE = 1;
const UNBOUNDED_SPAN = Number.MAX_SAFE_INTEGER;
const REPOSITORY_ROOT = join(MODULE_DIRECTORY, "..", "..", "..", "..");

const SNAPSHOTS_DIRECTORY = join(MODULE_DIRECTORY, "snapshots");
export const CORE_LIBRARY_DIRECTORY = join(
	REPOSITORY_ROOT,
	"packages",
	"registry",
	"src",
	"core",
);
export const CLIENT_LIBRARY_DIRECTORY = join(
	REPOSITORY_ROOT,
	"packages",
	"registry",
	"src",
	"libraries",
);

// Primitive types the checker recognizes without an explicit declaration. The
// generators that need a wider set spread this one and add their own members.
export const PLATFORM_TYPES = new Set([
	"u8",
	"i8",
	"u16",
	"i16",
	"u32",
	"i32",
	"u64",
	"i64",
	"f32",
	"f64",
	"boolean",
]);

const SEVERITY_NAMES = {
	[SEVERITY.error]: "error",
	[SEVERITY.warning]: "warning",
	[SEVERITY.info]: "info",
};

// Builds the `libraries` object `check()` consumes, defaulting every optional
// collection to an empty one so each generator only declares what it exercises.
export const createLibraries = (overrides = {}) => {
	return {
		isLibrary: false,
		platformTypes: PLATFORM_TYPES,
		knownLibraries: new Set(),
		libraryExports: {},
		libraryFunctions: {},
		libraryObjectTypes: {},
		libraryEnumInfo: {},
		libraryTypes: {},
		...overrides,
	};
};

// Runs the shared tokenize -> parse -> check pipeline and returns the AST and
// the diagnostics, so generators do not repeat the three calls.
export const parseSource = (source) => {
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens, source);
	return { ast, comments };
};

export const checkSource = (source, libraries) => {
	const { ast, comments } = parseSource(source);
	const { errors } = check(ast, { ...libraries, comments });
	return { ast, errors };
};

// Resolvers for snippets that have no library calls / no per-name types.
export const resolveNoCallType = () => {
	return null;
};

export const hasErrorCode = (errors, errorCode) => {
	return errors.some((error) => {
		return error.code === errorCode;
	});
};

// Renders the boolean form most generators use: a `// description` line plus a
// `<label>: yes|no` line.
export const renderFlagCase = ({ description, label, flag }) => {
	return [`// ${description}`, `${label}: ${flag ? "yes" : "no"}`, ""].join("\n");
};

export const buildSnapshotReport = (header, cases, renderCase) => {
	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const collectProbes = (ast, probeNames) => {
	const probes = [];

	walk(ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.identifier) {
				return;
			}
			if (!probeNames.has(node.name)) {
				return;
			}
			probes.push({ name: node.name, location: node.loc });
		},
	});

	return probes;
};

export const renderDiagnostic = (diagnostic) => {
	const start = diagnostic.location?.start;
	const position = start ? `${start.line}:${start.column}` : "?";
	const severity = SEVERITY_NAMES[diagnostic.severity] ?? "unknown";
	return `${severity} ${diagnostic.code} @ ${position}: ${formatDiagnosticMessage(diagnostic)}`;
};

// `resolveProjectTypes` types library calls through this callback; the return
// types are known ahead of time, so it is a plain lookup bound to them.
const resolveLibraryCallType = (returnTypes, name) => {
	return returnTypes[name] ?? null;
};

// Reuses the same library introspection the LSP performs
// (`collectLibraryModuleInfo` + `resolveProjectTypes`), so the snapshot pins the
// editor-facing types and diagnostics for a core library. `marker`/`sample`
// replace a postinstall placeholder (e.g. the pin list) to mirror the installed
// project the editor reads.
export const readLibraryContext = ({
	libraryPath,
	packageName,
	marker,
	sample,
}) => {
	const rawSource = readFileSync(libraryPath, UTF8);
	const source = marker ? rawSource.replaceAll(marker, sample) : rawSource;
	const moduleInfo = collectLibraryModuleInfo(source, packageName);
	const libraryFunctions = { [packageName]: moduleInfo.functions };
	const returnTypes = buildLibraryFunctionReturnTypes(libraryFunctions);
	const libraries = {
		// Each case is a library-style program: its probes are exported, so unused
		// declarations are suppressed and only meaningful diagnostics remain.
		isLibrary: true,
		knownLibraries: new Set([packageName]),
		libraryExports: { [packageName]: moduleInfo.exports },
		libraryFunctions,
		libraryTypes: { [packageName]: moduleInfo.types },
		libraryEnumInfo: moduleInfo.enumInfo
			? { [packageName]: moduleInfo.enumInfo }
			: {},
		libraryObjectTypes: { [packageName]: moduleInfo.objectTypes },
	};
	return {
		libraries,
		resolveLibraryCallType: resolveLibraryCallType.bind(null, returnTypes),
		objectTypes: moduleInfo.objectTypes,
	};
};

const sourceOffsetAt = (source, point) => {
	const lines = source.split("\n");
	const previousLinesLength = lines
		.slice(0, point.line - 1)
		.reduce((total, line) => {
			return total + line.length + 1;
		}, 0);
	return previousLinesLength + point.column - 1;
};

// The enclosing type of `this.<field>` is the type of the innermost typed
// object literal around it (a factory return or a typed variable initializer),
// exactly what the checker derives and the codegen receives as `context.selfType`.
const findEnclosingSelfType = (ast, targetNode, objectLiteralTypes) => {
	const selfTypeStack = [];
	const result = { selfType: null };
	walk(ast, {
		enter: (node) => {
			const typeName = objectLiteralTypes.get(node);
			if (typeName) {
				selfTypeStack.push(typeName);
			}
			if (node === targetNode) {
				result.selfType = selfTypeStack[selfTypeStack.length - 1] ?? null;
				return false;
			}
		},
		exit: (node) => {
			if (objectLiteralTypes.get(node)) {
				selfTypeStack.pop();
			}
		},
	});
	return result.selfType;
};

const matchesProbeLocation = (node, probe) => {
	if (!probe.location) {
		return true;
	}
	return (
		node.loc.start.line === probe.location.line &&
		node.loc.start.column === probe.location.column
	);
};

// An expression probe pins the hover of a receiver shape the plain identifier
// probes cannot address (`box.counter`, `this.writer`, `makeCounter(5)`). It uses
// each candidate's AST `location` to check its source starts with the probe
// text, then keeps the narrowest node that covers it: `makeCounter(5)` wins over
// the enclosing `makeCounter(5).value()`, while the full call wins when that is
// the probe. `probe.location` can disambiguate repeated source text.
const findExpressionProbeNode = (ast, source, probe) => {
	const selection = { node: null, span: UNBOUNDED_SPAN };
	walk(ast, {
		enter: (node) => {
			if (!node.loc?.start || !node.loc?.end) {
				return;
			}
			if (node.type !== probe.nodeType || !matchesProbeLocation(node, probe)) {
				return;
			}
			const start = sourceOffsetAt(source, node.loc.start);
			if (!source.startsWith(probe.source, start)) {
				return;
			}
			const span = sourceOffsetAt(source, node.loc.end) - start;
			if (span < probe.source.length - LOCATION_END_TOLERANCE) {
				return;
			}
			if (span < selection.span) {
				selection.node = node;
				selection.span = span;
			}
		},
	});
	return selection.node;
};

// The selected node is resolved with the same helper the checker and codegen
// use, including the enclosing type for `this.<field>`.
const resolveExpressionProbe = (
	ast,
	source,
	probe,
	context,
	resolveCallType,
	variableTypes,
) => {
	const selectedNode = findExpressionProbeNode(ast, source, probe);
	if (!selectedNode) {
		return null;
	}
	const objectLiteralTypes = collectObjectLiteralTypes(ast, context.objectTypes);
	const selfType = findEnclosingSelfType(
		ast,
		selectedNode,
		objectLiteralTypes,
	);
	return resolveReceiverType(
		selectedNode,
		(name, location) => variableTypes.resolve(name, location),
		resolveCallType,
		DEFAULT_WORD_SIZE,
		context.objectTypes,
		{ selfType },
	);
};

// Renders one library snapshot case: diagnostics from the shared `check()` plus
// the resolved type of every probe, both from the same inference the LSP uses.
export const renderLibraryCase = (testCase, context) => {
	const source = `${testCase.body}\n`;
	const { ast, errors } = checkSource(source, context.libraries);
	const { variableTypes, resolveCallType } = resolveProjectTypes(
		ast,
		resolveWordDataType(DEFAULT_WORD_SIZE),
		context.resolveLibraryCallType,
		DEFAULT_WORD_SIZE,
		context.objectTypes,
	);

	const diagnosticLines = errors.map((error) => {
		return `- ${renderDiagnostic(error)}`;
	});
	const probeLines = collectProbes(ast, new Set(testCase.probes))
		.map((probe) => {
			const type =
				variableTypes.resolve(probe.name, probe.location) ?? "unresolved";
			return `- ${probe.name} => ${type}`;
		})
		.filter((line, index, lines) => {
			return lines.indexOf(line) === index;
		});
	const expressionProbeLines = (testCase.expressionProbes ?? []).map(
		(probe) => {
			const type =
				resolveExpressionProbe(
					ast,
					source,
					probe,
					context,
					resolveCallType,
					variableTypes,
				) ?? "unresolved";
			return `- ${probe.source} => ${type}`;
		},
	);

	return [
		`// ${testCase.label}`,
		"diagnostics:",
		...(diagnosticLines.length > 0 ? diagnosticLines : ["- none"]),
		"types:",
		...([...probeLines, ...expressionProbeLines].length > 0
			? [...probeLines, ...expressionProbeLines]
			: ["- none"]),
		"",
	].join("\n");
};

// A snapshot entry carries both the write path and the compared content; the
// runner consumes the same shape for every generator.
export const listSnapshots = (fileName, content) => {
	return [
		{
			fileName,
			snapshotPath: join(SNAPSHOTS_DIRECTORY, fileName),
			content,
		},
	];
};

export const writeSnapshots = (snapshots) => {
	for (const { snapshotPath, content } of snapshots) {
		mkdirSync(dirname(snapshotPath), { recursive: true });
		writeFileSync(snapshotPath, content, UTF8);
	}
};

// The generator modules double as CLI entry points; this reports whether the
// current process invoked the given module directly.
export const isMainModule = (moduleUrl) => {
	return (
		Boolean(process.argv[1]) &&
		moduleUrl === pathToFileURL(process.argv[1]).href
	);
};
