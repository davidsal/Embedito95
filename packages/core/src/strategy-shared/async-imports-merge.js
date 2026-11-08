import { getImportEffectiveName } from "../checker/index.js";
import { AST_NODE } from "../constants.js";

const collectImportsBySource = (ast) => {
	const importsBySource = new Map();
	const importedNamesBySource = new Map();
	let lastImport = null;

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		importsBySource.set(statement.source, statement);
		importedNamesBySource.set(
			statement.source,
			new Set((statement.specifiers ?? []).map(getImportEffectiveName)),
		);
		lastImport = statement;
	}

	return { importsBySource, importedNamesBySource, lastImport };
};

const collectMissingSpecifiers = (node, importedNames) => {
	return (node.specifiers ?? []).filter((specifier) => {
		const name = getImportEffectiveName(specifier);
		if (importedNames.has(name)) {
			return false;
		}
		importedNames.add(name);
		return true;
	});
};

const mergeImportNode = (node, importsBySource, newImportsBySource) => {
	const existingImport = importsBySource.get(node.source);
	if (existingImport) {
		existingImport.specifiers = [
			...(existingImport.specifiers ?? []),
			...node.specifiers,
		];
		return;
	}

	const pendingImport = newImportsBySource.get(node.source);
	if (pendingImport) {
		pendingImport.specifiers.push(...node.specifiers);
		return;
	}

	newImportsBySource.set(node.source, { ...node, specifiers: node.specifiers });
};

const rebaseImports = (imports, anchorLine) => {
	for (const node of imports) {
		if (node.loc?.start && node.loc?.end) {
			node.loc.start.line = anchorLine;
			node.loc.end.line = anchorLine;
		}
	}
};

export const mergeLibraryImports = (ast, importNodes) => {
	const { importsBySource, importedNamesBySource, lastImport } =
		collectImportsBySource(ast);
	const newImportsBySource = new Map();

	for (const node of importNodes) {
		const importedNames = importedNamesBySource.get(node.source) ?? new Set();
		importedNamesBySource.set(node.source, importedNames);
		const missingSpecifiers = collectMissingSpecifiers(node, importedNames);
		if (missingSpecifiers.length === 0) {
			continue;
		}
		mergeImportNode(
			{ ...node, specifiers: missingSpecifiers },
			importsBySource,
			newImportsBySource,
		);
	}

	const merged = [...newImportsBySource.values()];

	if (merged.length === 0) {
		return;
	}

	rebaseImports(merged, (lastImport?.loc?.start?.line ?? 0) + 1);

	const insertIndex = lastImport ? ast.body.indexOf(lastImport) + 1 : 0;
	ast.body.splice(insertIndex, 0, ...merged);
};
