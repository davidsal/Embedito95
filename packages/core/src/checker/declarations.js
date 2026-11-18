import { AST_NODE, DATA_TYPE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { createAsyncTaskType } from "./async-task-type.js";
import { getDeclaration } from "./declaration-accessors.js";
import { checkImportStatement } from "./import-declarations.js";
import { isModuleNameTaken } from "./imports.js";
import { expandWidthFamilySignature } from "./library-types.js";
import {
	buildFunctionSignature,
	getFunctionSignatures,
	hasRegisteredSignature,
	isDistinctCoreLibrarySignature,
} from "./overloads.js";
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

const registerFunctionDefinition = (
	state,
	name,
	signatureList,
	initializer,
	location,
) => {
	const existing = state.functionDefinitions[name];
	const signatures = existing ? [...getFunctionSignatures(existing)] : [];
	for (const signature of signatureList) {
		if (!hasRegisteredSignature({ signatures }, signature)) {
			signatures.push(signature);
		}
	}
	const firstSignature = signatures[0];
	state.functionParameterCount[name] = firstSignature.params.length;
	state.functionDefinitions[name] = {
		params: firstSignature.params,
		returnType:
			initializer.async === true
				? createAsyncTaskType(firstSignature.returnType)
				: firstSignature.returnType,
		signatures,
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

		const baseSignature = buildFunctionSignature(initializer);
		const signatures = state.isCoreLibrary
			? expandWidthFamilySignature(baseSignature)
			: [baseSignature];
		// A width-family declaration expands before the checker sees it. When
		// the library was already loaded, its expanded signatures are present,
		// so this is the same declaration, not a duplicate.
		const alreadyRegistered =
			state.isCoreLibrary &&
			signatures.length > 1 &&
			signatures.every((signature) => {
				return hasRegisteredSignature(
					state.functionDefinitions[name],
					signature,
				);
			});
		const isOverload =
			signatures.every((signature) => {
				return isDistinctCoreLibrarySignature(state, name, signature);
			}) && signatures.length > 0;
		if (!isOverload && !alreadyRegistered) {
			checkNameTaken(state, name, location);
		}
		if (!state.defined.has(name)) {
			state.defined.set(name, statement);
		}
		registerFunctionDefinition(state, name, signatures, initializer, location);
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
