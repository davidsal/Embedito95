import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CONFIG_FILE,
	check,
	DEFAULT_WORD_SIZE,
	E95_EXTENSION,
	excludeLibrary,
	format,
	LIBRARY_PROJECT_TYPE,
	loadProjectEngine,
	MAIN_FILE,
	parse,
	resolvePlatformTypes,
	tokenize,
	UTF8,
} from "embedito95-core";
import { TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { computeDiagnostics } from "../diagnostics.js";
import { onCompletion } from "./completions/index.js";
import { onHover } from "./hover/index.js";
import { getSemanticTokens, SEMANTIC_TOKEN_LEGEND } from "./semantic-tokens.js";
import {
	findEnclosingLibraryConfig,
	findProjectRoot,
	loadLibrariesFromContext,
	withLocalModules,
} from "./shared/libraries.js";

const TEMPLATE_NAME_PREFIX = "template";
const TEST_FILE_MARKER = ".test.";
const SNAPSHOT_FILE_MARKER = ".snap.";

const SERVER_STATE = { platform: null };

const readDocumentConfig = (documentDirectory) => {
	try {
		const configPath = join(documentDirectory, CONFIG_FILE);
		return JSON.parse(readFileSync(configPath, UTF8));
	} catch {
		return null;
	}
};

const isSkippedE95Document = (documentPath) => {
	if (!documentPath.endsWith(E95_EXTENSION)) {
		return false;
	}
	const documentBasename = basename(documentPath);
	return (
		documentBasename.startsWith(TEMPLATE_NAME_PREFIX) ||
		documentBasename.includes(TEST_FILE_MARKER) ||
		documentBasename.includes(SNAPSHOT_FILE_MARKER)
	);
};

const loadConfig = async (rootUri) => {
	if (!rootUri) {
		return;
	}

	try {
		const rootPath = fileURLToPath(rootUri);
		SERVER_STATE.platform = await loadProjectEngine(rootPath);
	} catch {
		SERVER_STATE.platform = null;
	}
};

const getDocumentPath = (document) => {
	try {
		return fileURLToPath(document.uri);
	} catch {
		return null;
	}
};

const loadDocumentLibraries = (documentDirectory, documentPath) => {
	const config = readDocumentConfig(documentDirectory);
	const isLibrary = config?.type === LIBRARY_PROJECT_TYPE;
	const isEntry = !isLibrary && basename(documentPath) === MAIN_FILE;
	const baseLibraries = loadLibrariesFromContext(documentDirectory);
	const libraryPackage = isLibrary
		? (findEnclosingLibraryConfig(documentDirectory)?.package ?? null)
		: null;
	const scopedLibraries = isLibrary
		? excludeLibrary(baseLibraries, libraryPackage)
		: baseLibraries;

	return {
		isLibrary,
		isEntry,
		libraries: {
			...withLocalModules(scopedLibraries, documentPath),
			libraryPackage,
		},
	};
};

const buildEmptyLibraries = () => {
	return {
		knownLibraries: new Set(),
		libraryExports: {},
		libraryFunctions: {},
		libraryTypes: {},
		libraryEnumInfo: {},
	};
};

const loadDiagnosticsContext = async (documentPath) => {
	try {
		const documentDirectory = dirname(documentPath);
		const baseDirectory =
			findProjectRoot(documentDirectory) ?? documentDirectory;
		SERVER_STATE.platform = await loadProjectEngine(baseDirectory);
		return loadDocumentLibraries(documentDirectory, documentPath);
	} catch {
		SERVER_STATE.platform = null;
		return {
			isLibrary: false,
			isEntry: false,
			libraries: buildEmptyLibraries(),
		};
	}
};

const validate = async (document, connection) => {
	const documentPath = getDocumentPath(document);

	if (!documentPath || isSkippedE95Document(documentPath)) {
		connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
		return;
	}

	const { libraries, isLibrary, isEntry } =
		await loadDiagnosticsContext(documentPath);
	const diagnostics = await computeDiagnostics(
		document.getText(),
		SERVER_STATE.platform,
		libraries,
		isLibrary,
		isEntry,
	);

	connection.sendDiagnostics({
		uri: document.uri,
		diagnostics,
	});
};

const loadSemanticTokenLibraries = (document) => {
	try {
		const documentPath = fileURLToPath(document.uri);
		return loadDocumentLibraries(dirname(documentPath), documentPath).libraries;
	} catch {
		return null;
	}
};

const hasBlockingCheckErrors = (syntaxTree, comments, source, documentPath) => {
	try {
		const { libraries, isLibrary, isEntry } = loadDocumentLibraries(
			dirname(documentPath),
			documentPath,
		);
		const { errors: checkErrors } = check(syntaxTree, {
			...libraries,
			isLibrary,
			isEntry,
			comments,
			source,
			wordSize: SERVER_STATE.platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE,
			platformTypes: resolvePlatformTypes(SERVER_STATE.platform),
		});

		return checkErrors.some((error) => (error.severity ?? 0) === 0);
	} catch {
		// skip formatting if config.json can't be read
		return false;
	}
};

const buildFormattingEdit = (source, formatted) => {
	return [
		{
			range: {
				start: { line: 0, character: 0 },
				end: {
					line: source.split("\n").length,
					character: 0,
				},
			},
			newText: formatted,
		},
	];
};

export const createServer = (connection) => {
	const documents = new TextDocuments(TextDocument);

	connection.onInitialize(async (requestParameters) => {
		await loadConfig(requestParameters.rootUri);

		return {
			capabilities: {
				textDocumentSync: {
					openClose: true,
					change: 1,
				},
				completionProvider: {
					triggerCharacters: ["."],
				},
				documentFormattingProvider: true,
				hoverProvider: true,
				semanticTokensProvider: {
					legend: SEMANTIC_TOKEN_LEGEND,
					full: true,
				},
			},
		};
	});

	connection.languages.semanticTokens.on((requestParameters) => {
		const document = documents.get(requestParameters.textDocument.uri);

		if (!document) {
			return null;
		}

		return getSemanticTokens(
			document.getText(),
			loadSemanticTokenLibraries(document),
		);
	});

	connection.onDocumentFormatting((requestParameters) => {
		const document = documents.get(requestParameters.textDocument.uri);

		if (!document) {
			return [];
		}

		const documentPath = getDocumentPath(document);

		if (!documentPath || isSkippedE95Document(documentPath)) {
			return [];
		}

		const source = document.getText();
		const { tokens, errors: lexErrors } = tokenize(source);

		if (lexErrors.length > 0) {
			return [];
		}

		const { ast: syntaxTree, errors: parseErrors, comments } = parse(tokens);

		if (parseErrors.length > 0) {
			return [];
		}

		if (hasBlockingCheckErrors(syntaxTree, comments, source, documentPath)) {
			return [];
		}

		const formatted = format(syntaxTree, comments, source);

		if (formatted === source) {
			return [];
		}

		return buildFormattingEdit(source, formatted);
	});

	connection.onCompletion((requestParameters) => {
		return onCompletion(requestParameters, documents, SERVER_STATE.platform);
	});

	connection.onHover(async (requestParameters) => {
		return onHover(requestParameters, documents);
	});

	connection.onDidChangeConfiguration(() => {
		loadConfig(documents.options?.rootUri);
	});

	documents.onDidOpen(({ document }) => {
		validate(document, connection);
	});

	documents.onDidChangeContent(({ document }) => {
		validate(document, connection);
	});

	documents.listen(connection);

	return { connection, documents };
};
