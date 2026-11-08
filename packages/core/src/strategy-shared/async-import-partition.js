import {
	collectReferencedNames,
	getImportEffectiveName,
} from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { parseStatements, rebaseLines } from "./async-ast-utils.js";

export const declarationNames = (statement) => {
	if (
		statement.type === AST_NODE.enumDeclaration ||
		statement.type === AST_NODE.typeDeclaration
	) {
		return statement.name ? [statement.name] : [];
	}
	if (statement.type === AST_NODE.variableDeclaration) {
		return (statement.declarations ?? [])
			.map((declarator) => declarator.id?.name)
			.filter(Boolean);
	}

	return [];
};

export const collectDeclaredNames = (statements) => {
	const names = new Set();

	for (const statement of statements) {
		for (const name of declarationNames(statement)) {
			names.add(name);
		}
	}

	return names;
};

export const markExports = (statements, exportedNames) => {
	const exported = new Set(exportedNames);

	for (const statement of statements) {
		if (declarationNames(statement).some((name) => exported.has(name))) {
			statement.export = true;
		}
	}
};

const findLastImportIndex = (body) => {
	let index = -1;

	for (let position = 0; position < body.length; position++) {
		if (body[position].type === AST_NODE.importDeclaration) {
			index = position;
		}
	}

	return index;
};

export const insertImport = (program, neededNames, importSource) => {
	if (neededNames.length === 0) {
		return;
	}

	const [importNode] = parseStatements(
		`import { ${neededNames.join(", ")} } from '${importSource}'\n`,
	);
	const lastImportIndex = findLastImportIndex(program.body);
	const anchor = program.body[lastImportIndex];
	rebaseLines(importNode, anchor?.loc?.start?.line ?? 0);
	program.body.splice(lastImportIndex + 1, 0, importNode);
};

export const resolveNeededNames = (declaredNames, program) => {
	const referenced = collectReferencedNames(program);

	return [...declaredNames].filter((name) => referenced.has(name)).sort();
};

const buildPartitionedImport = (statement, specifiers) => {
	if (specifiers.length === 0) {
		return null;
	}
	return { ...statement, specifiers };
};

const partitionImport = (statement, asyncReferenced, mainReferenced) => {
	const asyncSpecifiers = [];
	const mainSpecifiers = [];

	for (const specifier of statement.specifiers ?? []) {
		const name = getImportEffectiveName(specifier);
		if (asyncReferenced.has(name)) {
			asyncSpecifiers.push(specifier);
		}
		if (mainReferenced.has(name)) {
			mainSpecifiers.push(specifier);
		}
	}

	return {
		asyncImport: buildPartitionedImport(statement, asyncSpecifiers),
		mainImport: buildPartitionedImport(statement, mainSpecifiers),
	};
};

export const partitionImports = (asyncProgram, mainProgram) => {
	const asyncReferenced = collectReferencedNames(asyncProgram);
	const mainReferenced = collectReferencedNames(mainProgram);
	const asyncImports = [];
	const mainBody = [];

	for (const statement of mainProgram.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			mainBody.push(statement);
			continue;
		}

		const { asyncImport, mainImport } = partitionImport(
			statement,
			asyncReferenced,
			mainReferenced,
		);

		if (asyncImport) {
			asyncImports.push(asyncImport);
		}
		if (mainImport) {
			mainBody.push(mainImport);
		}
	}

	mainProgram.body = mainBody;
	asyncProgram.body = [...asyncImports, ...asyncProgram.body];
};
