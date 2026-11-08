import { inferArrayElementType, parseArrayType } from "../checker/index.js";
import {
	AST_NODE,
	DATA_TYPE,
	ENUM_C_TYPE_PREFIX,
	ENUM_TYPES_MARKER,
	ENUM_UNDERLYING_C_TYPE,
	SPECIAL_LIBRARY_TYPES,
} from "../constants.js";
import { renderExpression } from "./expression.js";
import { renderTypedObjectLiteral } from "./object-literal-render.js";
import { expressionDataType } from "./type-resolve.js";

const renderArrayElement = (element, elementType, context, lines) => {
	if (element?.type === AST_NODE.literal && typeof element.value === "string") {
		return JSON.stringify(element.value);
	}
	if (element?.type === AST_NODE.arrayLiteral) {
		const nestedCType = context.toCType(elementType);
		const innerElementType =
			parseArrayType(elementType)?.elementType ?? context.wordCType;
		const inner = element.elements.map((child) => {
			return renderArrayElement(child, innerElementType, context, lines);
		});
		return `${nestedCType}(${inner.join(", ")})`;
	}
	if (
		element?.type === AST_NODE.objectLiteral &&
		!parseArrayType(elementType) &&
		context.isObjectHandle?.(elementType)
	) {
		const typedLiteral = renderTypedObjectLiteral(
			element,
			elementType,
			context,
			lines,
		);
		return `${context.toCType(elementType)}(${context.objectStorageCType(elementType)}${typedLiteral})`;
	}
	return renderExpression(element, context, lines);
};

export const renderArrayDeclaration = (
	declaration,
	arrayInfo,
	context,
	lines,
) => {
	const name = declaration.id.name;
	const elementType = context.toCType(arrayInfo.elementType);
	const init = declaration.init;

	if (init && init.type !== AST_NODE.arrayLiteral) {
		const renderedInit = renderExpression(init, context, lines);
		lines.push(`core_array::Array<${elementType}> ${name} = ${renderedInit};`);
		return;
	}

	const elements =
		init?.type === AST_NODE.arrayLiteral ? (init.elements ?? []) : [];
	const renderedElements = elements.map((element) => {
		return renderArrayElement(element, arrayInfo.elementType, context, lines);
	});

	if (renderedElements.length > 0) {
		lines.push(
			`core_array::Array<${elementType}> ${name} = { ${renderedElements.join(", ")} };`,
		);
		return;
	}
	lines.push(`core_array::Array<${elementType}> ${name};`);
};

const resolveElementExpressionType = (element, context) => {
	return expressionDataType(
		element,
		context.resolveNameType,
		context.ast,
		null,
		context.resolveCallType,
		context.wordSize,
		null,
		null,
		null,
		context.objectTypes,
	);
};

export const resolveArrayElementType = (
	annotation,
	init,
	context,
	isLet = false,
) => {
	if (annotation) {
		return annotation;
	}
	const elementType = inferArrayElementType(
		context.ast,
		init?.elements,
		context.resolveNameType,
		context.wordType,
		(element) => resolveElementExpressionType(element, context),
		isLet,
	);
	return elementType ?? context.wordCType;
};

const renderEnumTypedefs = (enumInfo, style, underlyingTypes) => {
	const blocks = [];

	for (const [typeName, declarations] of Object.entries(
		enumInfo?.declarations ?? {},
	)) {
		if (SPECIAL_LIBRARY_TYPES.has(typeName)) {
			continue;
		}

		if (style === "alias") {
			blocks.push(`typedef int ${ENUM_C_TYPE_PREFIX}${typeName};`);
			continue;
		}

		const members = declarations.map((member) => {
			return member.value !== null && member.value !== undefined
				? `${member.name} = ${member.value}`
				: member.name;
		});
		const underlying =
			ENUM_UNDERLYING_C_TYPE[underlyingTypes?.[typeName]] ??
			ENUM_UNDERLYING_C_TYPE[DATA_TYPE.u8];
		blocks.push(
			`typedef enum : ${underlying} {\n\t${members.join(",\n\t")}\n} ${ENUM_C_TYPE_PREFIX}${typeName};`,
		);
	}

	return blocks.join("\n\n");
};

const findLibraryEnumUnderlyingType = (name, libraryEnumInfo) => {
	for (const info of Object.values(libraryEnumInfo)) {
		if (info?.types?.[name] !== undefined) {
			return info.types[name];
		}
	}
	return DATA_TYPE.u8;
};

export const renderProjectLibraryEnumTypedefs = (ast, libraryEnumInfo) => {
	const declarations = ast.body.filter(
		(statement) => statement.type === AST_NODE.enumDeclaration,
	);

	return declarations
		.map((statement) => {
			const typeName = statement.name;
			const underlying =
				ENUM_UNDERLYING_C_TYPE[
					findLibraryEnumUnderlyingType(typeName, libraryEnumInfo)
				] ?? ENUM_UNDERLYING_C_TYPE[DATA_TYPE.u8];
			const members = (statement.members ?? []).map((member) => {
				return member.value?.value !== null && member.value?.value !== undefined
					? `${member.name} = ${member.value.value}`
					: member.name;
			});
			return `typedef enum : ${underlying} {\n\t${members.join(",\n\t")}\n} ${typeName};`;
		})
		.join("\n\n");
};

export const renderLibraryBuildArtifacts = (
	libraryModule,
	platform,
	enumInfo,
	enumStyle,
) => {
	const support = libraryModule.generateSupport?.(platform) ?? "";
	const source = libraryModule.generateSource?.(platform) ?? "";
	const enumUnderlyingTypes = enumInfo?.types ?? {};
	const enumTypedefs = enumInfo
		? renderEnumTypedefs(enumInfo, enumStyle, enumUnderlyingTypes)
		: "";

	const header = support.includes(ENUM_TYPES_MARKER)
		? support.replace(ENUM_TYPES_MARKER, enumTypedefs)
		: support;

	return { header, source };
};
