import {
	check,
	DEFAULT_WORD_SIZE,
	ERROR_CODE,
	formatDiagnosticMessage,
	isTruncationWarning,
	parse,
	resolvePlatformTypes,
	SEVERITY,
	tokenize,
} from "embedito95-core";

const SOURCE_NAME = "embedito95";

const ENTRY_GLOBAL_ERROR_CODES = new Set([
	ERROR_CODE.missingRequiredFunction,
	ERROR_CODE.missingSetupCall,
]);

const computeDimmedRange = (source, visibleError) => {
	const lines = source.split("\n");
	const errorLine = visibleError.location?.start?.line ?? 1;

	if (errorLine >= lines.length) {
		return null;
	}

	return {
		range: {
			start: {
				line: errorLine,
				character: 0,
			},
			end: {
				line: lines.length - 1,
				character: lines[lines.length - 1].length,
			},
		},
		severity: 4,
		message: " ",
		source: SOURCE_NAME,
		tags: [1],
	};
};

const toLspDiagnostic = (diagnostic) => {
	const location = diagnostic.location ?? {
		start: { line: 1, column: 1 },
		end: { line: 1, column: 1 },
	};

	const isValidPoint = (point) =>
		point && Number.isInteger(point.line) && Number.isInteger(point.column);

	if (!isValidPoint(location.start) || !isValidPoint(location.end)) {
		return null;
	}

	return {
		range: {
			start: {
				line: location.start.line - 1,
				character: location.start.column - 1,
			},
			end: {
				line: location.end.line - 1,
				character: location.end.column - 1,
			},
		},
		severity: (diagnostic.severity ?? 0) + 1,
		message: formatDiagnosticMessage(diagnostic),
		code: diagnostic.code,
		source: SOURCE_NAME,
		...(diagnostic.tag !== undefined && { tags: [diagnostic.tag] }),
	};
};

const emitWithDimmed = (source, error, diagnostics, skipFirstError = false) => {
	if (!skipFirstError) {
		const visibleError = toLspDiagnostic(error);

		if (visibleError) {
			diagnostics.push(visibleError);
		}
	}

	const dimmed = computeDimmedRange(source, error);

	if (dimmed) {
		diagnostics.push(dimmed);
	}
};

const isEntryGlobalError = (diagnostic) => {
	return ENTRY_GLOBAL_ERROR_CODES.has(diagnostic.code);
};

const selectVisibleError = (checkErrors) => {
	const localErrors = checkErrors.filter((diagnostic) => {
		return !isEntryGlobalError(diagnostic);
	});

	if (localErrors.length > 0) {
		return localErrors[0];
	}

	return checkErrors.find(isEntryGlobalError);
};

export const computeDiagnostics = (
	source,
	platform,
	libraries = {},
	isLibrary = false,
	isEntry = !isLibrary,
) => {
	const diagnostics = [];

	const { tokens, errors: lexErrors } = tokenize(source);

	if (lexErrors.length > 0) {
		emitWithDimmed(source, lexErrors[0], diagnostics);
		return diagnostics;
	}

	const { ast: syntaxTree, errors: parseErrors, comments } = parse(tokens);

	if (parseErrors.length > 0) {
		emitWithDimmed(source, parseErrors[0], diagnostics);
		return diagnostics;
	}

	const { errors: checkErrors } = check(syntaxTree, {
		...libraries,
		isLibrary,
		isEntry,
		comments,
		source,
		wordSize: platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE,
		platformTypes: resolvePlatformTypes(platform),
	});

	diagnostics.push(
		...checkErrors
			.filter(
				(diagnostic) =>
					(diagnostic.severity ?? SEVERITY.error) !== SEVERITY.error &&
					!isTruncationWarning(diagnostic),
			)
			.map((e) => toLspDiagnostic(e))
			.filter((diagnostic) => diagnostic !== null),
	);

	const checkErrorsOnly = checkErrors.filter(
		(e) => (e.severity ?? SEVERITY.error) === SEVERITY.error,
	);

	if (checkErrorsOnly.length > 0) {
		emitWithDimmed(source, selectVisibleError(checkErrorsOnly), diagnostics);
	}

	return diagnostics;
};
