import { ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { getImportEffectiveName } from "./imports.js";

export const checkImportStatement = (state, statement) => {
	const seen = new Set();
	for (const specifier of statement.specifiers) {
		const effectiveName = getImportEffectiveName(specifier);
		state.imported.push({ name: effectiveName, location: specifier.loc });
		state.importedNames.add(effectiveName);
		if (seen.has(effectiveName)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.duplicateImport,
					params: { name: effectiveName },
					location: specifier.loc,
				}),
			);
		}
		seen.add(effectiveName);
	}

	const libraryExportNames = state.libraryExports[statement.source];
	const isLibraryKnown = state.knownLibraries.has(statement.source);

	if (!isLibraryKnown) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unknownLibrary,
				params: { name: statement.source },
				location: statement.loc,
			}),
		);
	} else if (libraryExportNames) {
		for (const specifier of statement.specifiers) {
			if (!libraryExportNames.has(specifier.name)) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.unknownImport,
						params: { name: specifier.name },
						location: specifier.loc,
					}),
				);
			}
		}
	} else {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.libraryLoadFailed,
				params: { name: statement.source },
				location: statement.loc,
			}),
		);
	}
};
