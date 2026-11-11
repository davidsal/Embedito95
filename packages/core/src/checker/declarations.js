import { AST_NODE, DATA_TYPE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { createAsyncTaskType } from "./async-task-type.js";
import { getDeclaration } from "./declaration-accessors.js";
import { getImportEffectiveName, isModuleNameTaken } from "./imports.js";
import { resolveFloatType, resolveIntegerType } from "./type-resolution.js";
import { REQUIRED_FUNCTIONS, RESERVED_NAMES } from "./types.js";

export const buildTypeDeclarationMembers = (members) => {
	const methods = {};
	const fields = {};

	for (const member of members) {
		if (member.kind === "method") {
			methods[member.name] = {
				params: member.params ?? [],
				returnType: member.returnType ?? DATA_TYPE.void,
			};
		} else {
			fields[member.name] = {
				type: member.returnType ?? null,
				optional: Boolean(member.optional),
			};
		}
	}

	return { methods, fields };
};

export const checkTopLevelDeclarations = (state) => {
	for (const statement of state.ast.body) {
		if (statement.type === AST_NODE.importDeclaration && statement.source) {
			checkImportStatement(state, statement);
		}

		if (statement.type === AST_NODE.typeDeclaration) {
			checkTypeDeclarationStatement(state, statement);
		}

		if (statement.type === AST_NODE.enumDeclaration) {
			checkEnumDeclarationStatement(state, statement);
		}

		if (statement.type === AST_NODE.variableDeclaration) {
			checkVariableDeclarationStatement(state, statement);
		}

		if (statement.export) {
			if (state.isEntry) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.exportNotAllowed,
						params: {},
						location: statement.loc,
					}),
				);
			} else {
				const declaration = getDeclaration(statement);
				if (declaration) {
					state.exported.push(statement);
				}
			}
		}
	}
};

const checkImportStatement = (state, statement) => {
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

const checkTypeDeclarationStatement = (state, statement) => {
	if (
		state.defined.has(statement.name) ||
		state.importedNames.has(statement.name) ||
		state.enumTypes.has(statement.name) ||
		state.objectTypeNames.has(statement.name)
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.duplicateDeclaration,
				params: { name: statement.name },
				location: statement.nameIdent?.loc ?? statement.loc,
			}),
		);
	}

	const { methods, fields } = buildTypeDeclarationMembers(statement.members);

	state.objectTypes[statement.name] = { methods, fields };
	state.objectTypeNames.add(statement.name);
	state.localObjectTypeNames.add(statement.name);
	state.typeDeclarations.push({
		name: statement.name,
		statement,
		nameIdent: statement.nameIdent,
	});
};

const checkEnumDeclarationStatement = (state, statement) => {
	if (statement.members.length === 0) {
		const marker = state.libs.comments?.some(
			(comment) =>
				comment.line >= statement.loc.start.line + 1 &&
				comment.line <= statement.loc.end.line &&
				comment.value.trim().startsWith("// e95.postinstall"),
		);
		if (!marker) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.emptyEnum,
					params: { name: statement.name },
					location: statement.loc,
				}),
			);
		}
	}
	if (
		state.defined.has(statement.name) ||
		state.importedNames.has(statement.name)
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.duplicateDeclaration,
				params: { name: statement.name },
				location: statement.loc,
			}),
		);
	}
	state.enumTypes.add(statement.name);
	state.defined.set(statement.name, statement);
	state.enumDeclarations.push({
		name: statement.name,
		statement,
		nameIdent: statement.nameIdent,
	});

	const seenValues = new Map();
	let unifiedType = null;
	let typeMismatch = false;
	const seenKinds = new Set();

	for (const member of statement.members) {
		if (member.value !== null) {
			const raw = member.value.raw ?? String(member.value.value);
			const previousName = seenValues.get(raw);
			if (previousName) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.duplicateEnumValue,
						params: { name: member.name, value: raw, prev: previousName },
						location: member.loc,
					}),
				);
			}
			seenValues.set(raw, member.name);

			const memberValue = member.value.value;
			const kind = typeof memberValue;
			seenKinds.add(kind);
			if (unifiedType === null) {
				unifiedType = {
					min: memberValue,
					max: memberValue,
					isFloat: kind === "number" && !Number.isInteger(memberValue),
				};
			} else if (kind === typeof unifiedType.min) {
				if (kind === "number") {
					unifiedType.min = Math.min(unifiedType.min, memberValue);
					unifiedType.max = Math.max(unifiedType.max, memberValue);
					if (!Number.isInteger(memberValue)) unifiedType.isFloat = true;
				}
			} else {
				typeMismatch = true;
			}
		}
		if (
			state.defined.has(member.name) ||
			state.importedNames.has(member.name)
		) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.duplicateDeclaration,
					params: { name: member.name },
					location: member.loc,
				}),
			);
		}
		state.enumMemberNames.add(member.name);
		state.defined.set(member.name, statement);
	}

	if (typeMismatch || seenKinds.size > 1) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.mixedEnumTypes,
				params: { types: [...seenKinds].join(", ") },
				location: statement.loc,
			}),
		);
	} else if (unifiedType && typeof unifiedType.min === "number") {
		const abs = unifiedType.isFloat
			? unifiedType.max
			: Math.max(Math.abs(unifiedType.min), Math.abs(unifiedType.max));
		const hasNegative = unifiedType.min < 0;
		statement.enumType = hasNegative
			? resolveIntegerType(unifiedType.min, unifiedType.max)
			: unifiedType.isFloat
				? resolveFloatType(unifiedType.max)
				: resolveIntegerType(0, abs);
	} else if (unifiedType) {
		statement.enumType = unifiedType.type;
	} else if (statement.members.length > 0) {
		statement.enumType = DATA_TYPE.u8;
	}
};

const checkNameTaken = (state, name, location) => {
	if (
		isModuleNameTaken(
			name,
			state.defined,
			state.importedNames,
			state.enumMemberNames,
		)
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.duplicateDeclaration,
				params: { name },
				location,
			}),
		);
	}
};

const registerFunctionDefinition = (state, name, initializer, location) => {
	const functionParamCount = initializer.params.length;
	const functionParamTypes = initializer.params.map((param) => ({
		name: param.name,
		type: param.typeAnnotation?.type ?? null,
		functionType: param.typeAnnotation?.functionType ?? null,
		defaultValue: param.defaultValue ?? null,
	}));
	state.functionParameterCount[name] = functionParamCount;
	const declaredReturnType = initializer.returnType?.name ?? DATA_TYPE.void;
	state.functionDefinitions[name] = {
		params: functionParamTypes,
		returnType:
			initializer.async === true
				? createAsyncTaskType(declaredReturnType)
				: declaredReturnType,
	};

	if (REQUIRED_FUNCTIONS.includes(name) && initializer.async) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.asyncRequiredFunction,
				params: { name },
				location,
			}),
		);
	}
};

const checkVariableDeclarationStatement = (state, statement) => {
	const declaration = getDeclaration(statement);
	if (!declaration) return;

	const name = declaration.id?.name;
	const initializer = declaration.init;
	const location = declaration.id?.loc ?? statement.loc;

	if (initializer?.type === AST_NODE.functionExpression) {
		if (RESERVED_NAMES.includes(name)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.reservedName,
					params: { name },
					location: statement.loc,
				}),
			);
		}

		checkNameTaken(state, name, location);
		state.defined.set(name, statement);
		registerFunctionDefinition(state, name, initializer, location);
	} else if (initializer && REQUIRED_FUNCTIONS.includes(name)) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.expectedFunction,
				params: { name },
				location,
			}),
		);
		checkNameTaken(state, name, location);
		state.defined.set(name, statement);
	} else {
		checkNameTaken(state, name, location);
		state.defined.set(name, statement);
	}
};
