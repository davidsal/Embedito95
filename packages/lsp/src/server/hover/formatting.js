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

const NO_LOCATION_KEY = "none";

const describeWarningLocation = (location) => {
	if (!location?.start || !location?.end) {
		return NO_LOCATION_KEY;
	}
	const { start, end } = location;

	return `${start.line}:${start.column}-${end.line}:${end.column}`;
};

const castWarningKey = (warning) => {
	return [
		warning.kind,
		describeWarningLocation(warning.location),
		describeWarningLocation(warning.targetLocation),
		warning.rhsType,
		warning.targetType,
	].join("|");
};

// A single conversion can be reached by more than one collector (a declaration
// that also reads as an assignment, a node visited twice), so identical
// warnings collapse before formatting.
const dedupeCastWarnings = (warnings) => {
	const seenKeys = new Set();

	return warnings.filter((warning) => {
		const key = castWarningKey(warning);

		if (seenKeys.has(key)) {
			return false;
		}
		seenKeys.add(key);
		return true;
	});
};

export const collectCastWarnings = (
	syntaxTree,
	variableTypes,
	parameterTypesByName,
	wordSize,
	objectTypes,
	resolveCallType,
) => {
	const warnings = [
		...collectAssignmentCastWarnings(syntaxTree, {
			variableTypes,
			objectTypes,
			wordSize,
			resolveCallType,
		}),
		...collectArgumentCastWarnings(syntaxTree, {
			variableTypes,
			paramTypesByName: parameterTypesByName,
			wordSize,
			objectTypes,
			resolveCallType,
		}),
		...collectObjectCastWarnings(syntaxTree, {
			variableTypes,
			objectTypes,
			wordSize,
		}),
	];

	return dedupeCastWarnings(warnings);
};

const describeWarningSubject = (warning) => {
	if (warning.name) {
		return `\`${warning.name}\``;
	}
	return warning.kind === "argument" ? "the argument" : "the expression";
};

const formatNumericCastWarning = (warning) => {
	const subject = describeWarningSubject(warning);
	const source = `\`${warning.rhsType}\``;
	const target = `\`${warning.targetType}\``;

	if (warning.reason === "precision") {
		return `⚠ ${subject} is ${source} and may lose precision when stored as ${target}.`;
	}
	if (warning.reason === "truncation") {
		return `⚠ ${subject} is ${source} and is truncated toward zero when stored as ${target}.`;
	}
	if (warning.reason === "sign") {
		return `⚠ ${subject} is ${source} and may lose its sign when stored as ${target}.`;
	}
	if (warning.reason === "range") {
		return `⚠ ${subject} is ${source} and does not fit in ${target}; it may wrap.`;
	}
	return `⚠ ${subject} is ${source} while the target expects ${target}. An automatic cast is applied, which may lose information.`;
};

const formatCastWarning = (warning) => {
	if (warning.kind === "object") {
		return `⚠ \`${warning.name}\` is \`${warning.rhsType}\` and is stored as \`${warning.targetType}\`. The concrete type is erased; cast it back with \`as\` before use.`;
	}
	return formatNumericCastWarning(warning);
};

export const formatCastWarnings = (warnings) => {
	if (!warnings || warnings.length === 0) {
		return "";
	}

	const lines = warnings.map((warning) => {
		return formatCastWarning(warning);
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

const warningSourceName = (warning) => {
	if (warning.sourceName) {
		return warning.sourceName;
	}
	if (warning.kind === "argument") {
		return warning.name ?? null;
	}
	return null;
};

// A parameter hover is anchored at the declaration, so it cannot match a
// warning by `targetLocation` (the argument/assignment site). It matches the
// conversions whose source is that parameter inside the same function instead,
// and still accepts a warning anchored at the hover position. The shared dedupe
// keeps a parameter from repeating a conversion already shown for an
// assignment.
export const formatParameterCastWarningsSection = (
	line,
	column,
	allCastWarnings,
	parameterName,
	functionLocation,
) => {
	const matching = allCastWarnings.filter((warning) => {
		const anchored = Boolean(
			warning.targetLocation &&
				isInLocation(line, column, warning.targetLocation),
		);

		if (anchored) {
			return true;
		}
		if (warningSourceName(warning) !== parameterName) {
			return false;
		}
		const sourceLocation = warning.location;

		return Boolean(
			sourceLocation?.start &&
				functionLocation &&
				isInLocation(
					sourceLocation.start.line,
					sourceLocation.start.column,
					functionLocation,
				),
		);
	});

	return formatCastWarnings(dedupeCastWarnings(matching));
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
