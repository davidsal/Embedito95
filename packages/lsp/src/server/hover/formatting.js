import {
	collectArgumentCastWarnings,
	collectAssignmentCastWarnings,
	collectObjectCastWarnings,
	DATA_TYPE,
	decodeObjectShape,
	isObjectShapeType,
	resolveFloatType,
	resolveIntegerType,
	resolveLiteralDataType,
} from "embedito95-core";
import { isInLocation } from "../shared/location.js";

export const OPTIONAL_TYPE_SUFFIX = " | null";

const SHAPE_INDENT = "    ";

const formatShapeAtDepth = (type, depth) => {
	if (!isObjectShapeType(type)) {
		return type;
	}

	const fields = decodeObjectShape(type) ?? {};
	const entries = Object.entries(fields);

	if (entries.length === 0) {
		return "{}";
	}

	const fieldPadding = SHAPE_INDENT.repeat(depth + 1);
	const closePadding = SHAPE_INDENT.repeat(depth);
	const lines = entries.map(([name, definition], index) => {
		const optional = definition?.optional ? OPTIONAL_TYPE_SUFFIX : "";
		const fieldType = formatShapeAtDepth(
			definition?.type ?? "unknown",
			depth + 1,
		);
		const separator = index < entries.length - 1 ? "," : "";
		return `${fieldPadding}${name}: ${fieldType}${optional}${separator}`;
	});

	return `{\n${lines.join("\n")}\n${closePadding}}`;
};

export const formatObjectShapeType = (type) => {
	return formatShapeAtDepth(type, 0);
};

export const formatMethodParameterList = (parameters) => {
	return (parameters ?? [])
		.map((parameter) => {
			const typeSuffix = parameter.type ? `: ${parameter.type}` : "";
			return `${parameter.name}${typeSuffix}`;
		})
		.join(", ");
};

export const collectCastWarnings = (
	syntaxTree,
	variableTypes,
	parameterTypesByName,
	wordSize,
	objectTypes,
) => {
	return [
		...collectAssignmentCastWarnings(syntaxTree, {
			variableTypes,
			wordSize,
		}),
		...collectArgumentCastWarnings(syntaxTree, {
			variableTypes,
			paramTypesByName: parameterTypesByName,
			wordSize,
		}),
		...collectObjectCastWarnings(syntaxTree, {
			variableTypes,
			objectTypes,
			wordSize,
		}),
	];
};

export const formatCastWarnings = (warnings) => {
	if (!warnings || warnings.length === 0) {
		return "";
	}

	const lines = warnings.map((warning) => {
		if (warning.kind === "argument") {
			return `⚠ \`${warning.name ?? "the argument"}\` is \`${warning.rhsType}\` while the parameter expects \`${warning.targetType}\`. An automatic cast is applied, which may truncate the value.`;
		}
		if (warning.kind === "object") {
			return `⚠ \`${warning.name}\` is \`${warning.rhsType}\` and is stored as \`${warning.targetType}\`. The concrete type is erased; cast it back with \`as\` before use.`;
		}
		return `⚠ \`${warning.name}\` is \`${warning.targetType}\` while the right-hand expression is \`${warning.rhsType}\`. An automatic cast is applied, which may truncate the value.`;
	});

	return `\n\n${lines.join("\n")}`;
};

export const formatCastWarningsSection = (line, column, allCastWarnings) => {
	return formatCastWarnings(
		allCastWarnings.filter((warning) => {
			return (
				warning.targetLocation &&
				isInLocation(line, column, warning.targetLocation)
			);
		}),
	);
};

export const computeEnumType = (members) => {
	let min = null;
	let max = null;
	let isFloat = false;
	let kind = null;

	for (const member of members) {
		const value = member.value?.value;

		if (value === undefined || value === null) {
			continue;
		}

		if (kind === null) {
			kind = typeof value;
		} else if (typeof value !== kind) {
			return "unknown";
		}

		if (typeof value === "number") {
			if (min === null) {
				min = value;
				max = value;
			} else {
				min = Math.min(min, value);
				max = Math.max(max, value);
			}

			if (!Number.isInteger(value)) {
				isFloat = true;
			}
		}
	}

	if (kind === "number" && min !== null) {
		if (isFloat) {
			return resolveFloatType(max);
		}
		return resolveIntegerType(min, max);
	}

	if (kind === "boolean") {
		return DATA_TYPE.boolean;
	}
	if (kind === "string") {
		const first = members[0]?.value;

		return first
			? (resolveLiteralDataType(first) ?? DATA_TYPE.string)
			: DATA_TYPE.string;
	}
	if (members.length > 0) {
		return DATA_TYPE.u8;
	}

	return "unknown";
};

export const formatObjectMemberSignature = (member) => {
	if (member.kind === "method") {
		const parameters = formatMethodParameterList(member.params);
		return `${member.name}: (${parameters}) => ${member.returnType ?? "void"}`;
	}
	return `${member.name}: ${member.returnType ?? "unknown"}${member.optional ? OPTIONAL_TYPE_SUFFIX : ""}`;
};

export const formatPeripheralMemberHover = (signature, label, fields) => {
	const [header, ...remainingFields] = [label, ...fields];
	const fieldsSection = remainingFields.map((line) => `- ${line}`).join("\n");
	return {
		contents: {
			kind: "markdown",
			value: `${signature}\n\n${header}\n${fieldsSection}`,
		},
	};
};
