import {
	normalizeOperandTypes,
	resolveBinaryOperationType,
	resolveConstIntegerType,
} from "embedito95-core";
import {
	CANONICAL_CASES,
	CANONICAL_CASES_HEADING,
	CANONICAL_OVERFLOW_NOTE_LINES,
	COMPARISON_HEADING,
	COMPARISON_SECTION_LABEL,
	COMPARISON_SECTION_LINES,
	COMPARISON_TABLE_HEADER_LINES,
	COMPARISON_COLUMN_TITLES,
	DOCUMENT_FILE_NAME,
	DOCUMENT_PREAMBLE_LINES,
	OPERATIONS_TABLE_HEADER_LINES,
	OPERATION_COLUMN_TITLES,
	OPERATOR_COMMENT_PREFIX,
	OPERATOR_COMMENT_SUFFIX,
	OPERATORS_AND_PARAMETERS_LINES,
	REGENERATION_LINES,
	WORD_SIZES,
	ARITHMETIC_HEADING,
	ARITHMETIC_SECTION_LABEL,
} from "./binary-operators-content.mjs";
import {
	isMainModule,
	LANGUAGE_DOCS_DIRECTORY,
	listSnapshots,
	listSnapshotAt,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";
import {
	renderCode,
	renderMarkdownRow,
	renderMarkdownSeparator,
} from "./markdown-rendering.mjs";

const NUMERIC_TYPES = [
	"u8",
	"i8",
	"u16",
	"i16",
	"u32",
	"i32",
	"u64",
	"i64",
	"i128",
	"u128",
	"f32",
	"f64",
];

const ARITHMETIC_OPERATORS = ["+", "-", "*", "/", "%"];
const COMPARISON_OPERATORS = ["==", "!=", "<", "<=", ">", ">="];

const ERROR_RESULT = "error";
const UNKNOWN_TYPE = "?";
const FLOAT_SUFFIX_SEPARATOR = " | ";
const WORD_RESULTS_SEPARATOR = ", ";
const BOOLEAN_TYPE = "boolean";

const renderResult = (result) => {
	return result ?? ERROR_RESULT;
};

const isFloatType = (type) => {
	return type === "f32" || type === "f64";
};

const renderFloatSuffix = (leftType, rightType) => {
	const leftIsFloat = isFloatType(leftType);
	const rightIsFloat = isFloatType(rightType);

	if (leftIsFloat === rightIsFloat) {
		return "";
	}

	return `${FLOAT_SUFFIX_SEPARATOR}${leftIsFloat ? leftType : rightType}`;
};

// One arithmetic pair resolved twice: the portable result (no target word) and
// the final type on each supported word size. Both the `.txt` fixture and the
// Markdown page consume this structure, so they cannot drift apart.
const resolveOperationCell = (operator, leftType, rightType) => {
	const result = resolveBinaryOperationType(operator, leftType, rightType);

	if (result === null) {
		return {
			isError: true,
			portable: ERROR_RESULT,
			wordResults: WORD_SIZES.map(() => {
				return ERROR_RESULT;
			}),
		};
	}

	const floatSuffix = renderFloatSuffix(leftType, rightType);

	return {
		isError: false,
		portable: `${result}${floatSuffix}`,
		wordResults: WORD_SIZES.map((wordSize) => {
			const wordResult = normalizeOperandTypes(
				leftType,
				rightType,
				operator,
				wordSize,
			);
			return `${renderResult(wordResult)}${floatSuffix}`;
		}),
	};
};

// The fixture pins one promoted comparison type per pair, independent of the
// target word size, so the canonical cells repeat it in every word column.
const resolveComparisonCell = (leftType, rightType) => {
	const leftIsFloat = isFloatType(leftType);
	const rightIsFloat = isFloatType(rightType);

	if (leftIsFloat !== rightIsFloat) {
		return { portable: ERROR_RESULT };
	}

	const commonType = normalizeOperandTypes(leftType, rightType);
	const portable = `${BOOLEAN_TYPE} (${commonType ?? UNKNOWN_TYPE})`;
	return { portable };
};

const resolveFoldedCell = (foldedValue) => {
	const resultType = resolveConstIntegerType(foldedValue);
	return {
		portable: resultType,
		wordResults: WORD_SIZES.map(() => {
			return resultType;
		}),
	};
};

const collectTypePairs = () => {
	const pairs = [];

	for (let leftIndex = 0; leftIndex < NUMERIC_TYPES.length; leftIndex++) {
		const leftType = NUMERIC_TYPES[leftIndex];

		for (
			let rightIndex = leftIndex;
			rightIndex < NUMERIC_TYPES.length;
			rightIndex++
		) {
			pairs.push({ leftType, rightType: NUMERIC_TYPES[rightIndex] });
		}
	}

	return pairs;
};

const TYPE_PAIRS = collectTypePairs();

const renderOperationResult = (operator, leftType, rightType) => {
	const { isError, portable, wordResults } = resolveOperationCell(
		operator,
		leftType,
		rightType,
	);

	if (isError) {
		return ERROR_RESULT;
	}

	return `${portable} [${wordResults.join(WORD_RESULTS_SEPARATOR)}]`;
};

const renderComparisonResult = (operator, leftType, rightType) => {
	return resolveComparisonCell(leftType, rightType).portable;
};

const buildRows = (operators, renderRowFor) => {
	const lines = [];

	for (const operator of operators) {
		lines.push(`${OPERATOR_COMMENT_PREFIX}${operator}${OPERATOR_COMMENT_SUFFIX}`);

		for (const { leftType, rightType } of TYPE_PAIRS) {
			lines.push(
				`${leftType} ${operator} ${rightType} = ${renderRowFor(
					operator,
					leftType,
					rightType,
				)}`,
			);
		}

		lines.push("");
	}

	return `${lines.join("\n")}\n`;
};

const buildOperationsTable = () => {
	return `${OPERATIONS_TABLE_HEADER_LINES.join("\n")}${buildRows(ARITHMETIC_OPERATORS, renderOperationResult)}`;
};

const buildComparisonTable = () => {
	return `${COMPARISON_TABLE_HEADER_LINES.join("\n")}${buildRows(COMPARISON_OPERATORS, renderComparisonResult)}`;
};

const renderMarkdownOperationRow = (operator, leftType, rightType) => {
	const { portable, wordResults } = resolveOperationCell(
		operator,
		leftType,
		rightType,
	);
	return renderMarkdownRow([
		renderCode(leftType),
		renderCode(rightType),
		renderCode(portable),
		...wordResults.map(renderCode),
	]);
};

const renderMarkdownComparisonRow = (operator, leftType, rightType) => {
	const { portable } = resolveComparisonCell(leftType, rightType);
	return renderMarkdownRow([
		renderCode(leftType),
		renderCode(rightType),
		renderCode(portable),
	]);
};

const buildMarkdownOperatorSection = (operator, label, columnTitles, renderRow) => {
	const lines = [
		`### ${label} \`${operator}\``,
		"",
		renderMarkdownRow(columnTitles),
		renderMarkdownSeparator(columnTitles.length),
	];

	for (const { leftType, rightType } of TYPE_PAIRS) {
		lines.push(renderRow(operator, leftType, rightType));
	}

	lines.push("");
	return lines.join("\n");
};

const buildMarkdownSections = (operators, label, columnTitles, renderRow) => {
	const sections = [];

	for (const operator of operators) {
		sections.push(
			buildMarkdownOperatorSection(operator, label, columnTitles, renderRow),
		);
	}

	return sections.join("\n");
};

const buildMarkdownCanonicalRow = (canonicalCase) => {
	const resolved = Number.isInteger(canonicalCase.foldedValue)
		? resolveFoldedCell(canonicalCase.foldedValue)
		: resolveOperationCell(
				canonicalCase.operator,
				canonicalCase.leftType,
				canonicalCase.rightType,
			);
	return renderMarkdownRow([
		renderCode(canonicalCase.expression),
		`${renderCode(canonicalCase.leftType)}, ${renderCode(canonicalCase.rightType)}`,
		renderCode(resolved.portable),
		...resolved.wordResults.map(renderCode),
		canonicalCase.note,
	]);
};

const buildMarkdownCanonicalTable = () => {
	const columnTitles = [
		"Expression",
		"Operands",
		"Portable",
		...OPERATION_COLUMN_TITLES.slice(3),
		"Note",
	];
	const lines = [
		renderMarkdownRow(columnTitles),
		renderMarkdownSeparator(columnTitles.length),
	];

	for (const canonicalCase of CANONICAL_CASES) {
		lines.push(buildMarkdownCanonicalRow(canonicalCase));
	}

	return lines.join("\n");
};

const buildMarkdownDocument = () => {
	const lines = [
		...DOCUMENT_PREAMBLE_LINES,
		ARITHMETIC_HEADING,
		"",
		buildMarkdownSections(
			ARITHMETIC_OPERATORS,
			ARITHMETIC_SECTION_LABEL,
			OPERATION_COLUMN_TITLES,
			renderMarkdownOperationRow,
		),
		...COMPARISON_SECTION_LINES,
		buildMarkdownSections(
			COMPARISON_OPERATORS,
			COMPARISON_SECTION_LABEL,
			COMPARISON_COLUMN_TITLES,
			renderMarkdownComparisonRow,
		),
		CANONICAL_CASES_HEADING,
		"",
		buildMarkdownCanonicalTable(),
		"",
		...CANONICAL_OVERFLOW_NOTE_LINES,
		...OPERATORS_AND_PARAMETERS_LINES,
		...REGENERATION_LINES,
	];

	return `${lines.join("\n")}`;
};

export const listTypeTableSnapshots = () => {
	return [
		...listSnapshots("binary-operations.txt", buildOperationsTable()),
		...listSnapshots("binary-comparisons.txt", buildComparisonTable()),
		...listSnapshotAt(LANGUAGE_DOCS_DIRECTORY, DOCUMENT_FILE_NAME, buildMarkdownDocument()),
	];
};

export const writeTypeTableSnapshots = () => {
	writeSnapshots(listTypeTableSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeTypeTableSnapshots();
	console.log(
		`Generated binary-operations.txt, binary-comparisons.txt and ${DOCUMENT_FILE_NAME}`,
	);
}
