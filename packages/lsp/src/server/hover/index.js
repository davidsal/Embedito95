import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	AST_NODE,
	collectImportAliases,
	collectNullNarrowing,
	loadProjectEngine,
	parse,
	resolveLiteralDataType,
	resolveReceiverType,
	tokenize,
} from "embedito95-core";
import { formatDocComment, getDocComment } from "../shared/doc-comments.js";
import {
	findProjectRoot,
	loadProjectLibraryExports,
} from "../shared/libraries.js";
import { buildProjectTypeInference } from "../shared/type-inference.js";
import {
	findEnclosingSelfType,
	findIdentifierAt,
	findLiteralAt,
	findObjectPropertyKeyAt,
	findTypeMemberAt,
	findTypeNameAt,
} from "./ast-finders.js";
import {
	resolveResolvedVariableHover,
	resolveStatementDeclarationHover,
} from "./declaration-steps.js";
import {
	collectCastWarnings,
	formatCastWarningsSection,
	formatObjectMemberSignature,
} from "./formatting.js";
import {
	resolveEnumMemberHover,
	resolveLibraryExportHover,
} from "./library-steps.js";
import {
	NOT_HANDLED,
	resolveAwaitHover,
	resolveFunctionHover,
	resolveParameterHover,
	resolveVariableHover,
} from "./local-steps.js";
import {
	resolveMemberObjectHover,
	resolveObjectPropertyHover,
} from "./member-steps.js";
import { resolveObjectTypeNameHover } from "./type-name-hover.js";
import {
	buildParameterTypeResolver,
	formatHoverValue,
} from "./type-resolution.js";

const loadHoverPlatform = async (document) => {
	try {
		const documentPath = fileURLToPath(document.uri);
		const documentDirectory = dirname(documentPath);
		const baseDirectory =
			findProjectRoot(documentDirectory) ?? documentDirectory;
		return await loadProjectEngine(baseDirectory);
	} catch {
		return null;
	}
};

const resolveLiteralOrMemberHover = (context) => {
	const literal = findLiteralAt(
		context.syntaxTree,
		context.line,
		context.column,
	);

	if (literal) {
		const literalType = resolveLiteralDataType(literal) ?? "unknown";
		const literalValue =
			typeof literal.value === "number"
				? formatHoverValue(literal.value, literalType)
				: String(literal.value);

		return {
			contents: {
				kind: "markdown",
				value:
					`\`\`\`e95\nliteral ${literalType} = ${literalValue}\n\`\`\`` +
					formatCastWarningsSection(
						context.line,
						context.column,
						context.allCastWarnings,
					),
			},
		};
	}

	const member = findTypeMemberAt(
		context.syntaxTree,
		context.line,
		context.column,
	);

	if (member) {
		const docComment = getDocComment(context.comments, member.loc?.start?.line);
		const docSection = formatDocComment(docComment);
		const signature = `\`\`\`e95\n${formatObjectMemberSignature(member)}\n\`\`\``;

		return {
			contents: {
				kind: "markdown",
				value: signature + docSection,
			},
		};
	}

	return null;
};

const buildContext = (requestParameters, document) => {
	const source = document.getText();
	const { tokens } = tokenize(source);
	const { ast: syntaxTree, comments } = parse(tokens);

	return {
		documentUri: document.uri,
		source,
		syntaxTree,
		comments,
		importAliases: collectImportAliases(syntaxTree),
		line: requestParameters.position.line + 1,
		column: requestParameters.position.character + 1,
	};
};

const enrichHoverContext = (context, document) => {
	context.allExports = loadProjectLibraryExports(document.uri);
	const inference = buildProjectTypeInference({
		syntaxTree: context.syntaxTree,
		allExports: context.allExports,
		importAliases: context.importAliases,
		platform: context.hoverPlatform,
	});
	context.hoverWordSize = inference.wordSize;
	context.wordType = inference.wordType;
	context.objectTypes = inference.objectTypes;
	context.variableTypes = inference.variableTypes;
	context.resolveCallType = inference.resolveCallType;
	context.resolveNameType = inference.resolveNameType;
	context.narrowingRegions = collectNullNarrowing(context.syntaxTree);
};

const collectContextCastWarnings = (context) => {
	const resolveParameterTypes = buildParameterTypeResolver(
		context.syntaxTree,
		context.allExports,
		context.importAliases,
		context.hoverWordSize,
	);
	context.allCastWarnings = collectCastWarnings(
		context.syntaxTree,
		context.variableTypes,
		resolveParameterTypes,
		context.hoverWordSize,
		context.objectTypes,
		context.resolveCallType,
	);
};

const resolveMemberObjectType = (context, memberReceiver) => {
	if (memberReceiver?.type === AST_NODE.thisExpression) {
		return findEnclosingSelfType(
			context.syntaxTree,
			context.line,
			context.column,
			context.objectTypes,
		);
	}
	return resolveReceiverType(
		memberReceiver,
		context.resolveNameType,
		context.resolveCallType,
		context.hoverWordSize,
		context.objectTypes,
	);
};

const resolveNamedHover = (context) => {
	context.name = context.identifier
		? context.identifier.name
		: (findTypeNameAt(context.syntaxTree, context.line, context.column) ??
			null);
	context.isTypeReference = !context.identifier && context.name !== null;
	const memberExpression = context.identifier?.memberExpression ?? null;
	const memberReceiver = memberExpression?.object ?? null;

	context.memberObjectName = memberReceiver?.name ?? null;
	context.memberObjectType = memberExpression
		? resolveMemberObjectType(context, memberReceiver)
		: null;
	const enumMembers = context.allExports.enumMembers ?? {};
	context.memberEnumName =
		context.memberObjectName &&
		enumMembers[context.memberObjectName]?.includes(context.name)
			? context.memberObjectName
			: null;

	const memberObjectHover = resolveMemberObjectHover(context);

	if (memberObjectHover !== NOT_HANDLED) {
		return memberObjectHover;
	}

	for (const step of [
		resolveStatementDeclarationHover,
		resolveParameterHover,
		resolveVariableHover,
		resolveFunctionHover,
		resolveObjectTypeNameHover,
		resolveLibraryExportHover,
		resolveEnumMemberHover,
		resolveResolvedVariableHover,
	]) {
		const hover = step(context);

		if (hover !== NOT_HANDLED) {
			return hover;
		}
	}

	return null;
};

export const onHover = async (requestParameters, documents) => {
	const document = documents.get(requestParameters.textDocument.uri);

	if (!document) {
		return null;
	}

	const context = buildContext(requestParameters, document);
	context.hoverPlatform = await loadHoverPlatform(document);
	context.identifier = findIdentifierAt(
		context.syntaxTree,
		context.line,
		context.column,
	);
	context.objectPropertyAt = context.identifier
		? null
		: findObjectPropertyKeyAt(context.syntaxTree, context.line, context.column);

	enrichHoverContext(context, document);
	collectContextCastWarnings(context);

	if (!context.identifier && !context.objectPropertyAt) {
		const awaitHover = resolveAwaitHover(context);

		if (awaitHover !== NOT_HANDLED) {
			return awaitHover;
		}

		const anchoredHover = resolveLiteralOrMemberHover(context);

		if (anchoredHover) {
			return anchoredHover;
		}
	}

	const objectPropertyHover = resolveObjectPropertyHover(context);

	if (objectPropertyHover !== NOT_HANDLED) {
		return objectPropertyHover;
	}

	return resolveNamedHover(context);
};
