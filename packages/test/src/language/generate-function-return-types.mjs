import {
	collectNullNarrowing,
	collectVariableTypes,
	createNarrowedTypeResolver,
	ERROR_CODE,
	inferFunctionReturnType,
	resolveWordDataType,
} from "embedito95-core";
import {
	checkSource,
	createLibraries,
	isMainModule,
	listSnapshots,
	PLATFORM_TYPES,
	resolveNoCallType,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const WORD_SIZE = 16;
const FUNCTION_NAME = "testFunction";

const LIBRARIES = createLibraries({
	platformTypes: new Set([...PLATFORM_TYPES, "i128", "u128"]),
});

const buildProgram = ({ params, body, annotation, returnAnnotation }) => {
	const paramList = params.length > 0 ? `(${params.join(", ")})` : "()";
	const annotationText = annotation ? `: ${annotation}` : "";
	const returnTypeText = returnAnnotation ? `: ${returnAnnotation}` : "";
	const bodyLines = body.map((line) => {
		return `    ${line}`;
	}).join("\n");
	return `const ${FUNCTION_NAME}${annotationText} = ${paramList}${returnTypeText} => {
${bodyLines}
}
const setup = () => {}
const main = () => { setup() }
main()`;
};

const renderCase = (testCase) => {
	const source = buildProgram(testCase);
	const { ast, errors } = checkSource(source, {
		...LIBRARIES,
		wordSize: WORD_SIZE,
	});
	const wordType = resolveWordDataType(WORD_SIZE);
	const variableTypes = collectVariableTypes(
		ast,
		wordType,
		resolveNoCallType,
		WORD_SIZE,
	);
	const functionExpression = ast.body[0].declarations[0].init;
	const narrowingRegions = collectNullNarrowing(ast);
	const resolveNameType = createNarrowedTypeResolver(
		variableTypes,
		narrowingRegions,
	);
	const inferred = inferFunctionReturnType(
		functionExpression,
		resolveNameType,
		resolveNoCallType,
		WORD_SIZE,
		ast,
	);
	const checkerError = errors.some((error) => {
		return error.code === ERROR_CODE.incompatibleReturnTypes;
	});
	const mismatchError = errors.some((error) => {
		return error.code === ERROR_CODE.returnTypeMismatch;
	});
	const annotationError = errors.some((error) => {
		return error.code === ERROR_CODE.functionTypeAnnotation;
	});
	const nullableOperationError = errors.some((error) => {
		return error.code === ERROR_CODE.nullableOperation;
	});

	const { params, body, annotation, returnAnnotation } = testCase;
	const annotationText = annotation ? `: ${annotation}` : "";
	const returnTypeText = returnAnnotation ? `(): ${returnAnnotation}` : "";
	const label = params.length
		? `${annotationText} ${returnTypeText} ${body.join("; ")} [${params.join(", ")}]`
		: `${annotationText} ${returnTypeText} ${body.join("; ")}`;
	const inferredLabel = inferred.conflict ? "CONFLICT" : (inferred.type ?? "void");

	return [
		`// ${label.trim()}`,
		`inferred: ${inferredLabel}`,
		`checker incompatibleReturnTypes: ${checkerError ? "yes" : "no"}`,
		`checker returnTypeMismatch: ${mismatchError ? "yes" : "no"}`,
		`checker functionTypeAnnotation: ${annotationError ? "yes" : "no"}`,
		`checker nullableOperation: ${nullableOperationError ? "yes" : "no"}`,
		"",
	].join("\n");
};

const buildReport = () => {
	const cases = [
		{ params: [], body: ["return 1000"] },
		{ params: ["a: i16", "b: i32"], body: ["return a", "return b"] },
		{ params: ["a: i16"], body: ["return a", "return true"] },
		{ params: [], body: ["return 1.5", "return 100"] },
		{ params: [], body: ["return 0.30000000000000004"] },
		{ params: [], body: ["return 1e308"] },
		{ params: [], body: ["return 1.5"] },
		{ params: ["x: f64"], body: ["return x + 1.0"] },
		{ params: ["a: i16", "b: f64"], body: ["return a", "return b"] },
		{ params: [], body: ["return 1000 as i64", "return 5"] },
		{ params: ["a: u16"], body: ["return a"] },
		{ params: ["a: i16", "b: i16"], body: ["return a > b"] },
		{ params: [], body: ["return 1000"], returnAnnotation: "boolean" },
		{ params: [], body: ["return 1000"], returnAnnotation: "i16" },
		{ params: [], body: ["return 1000"], returnAnnotation: "i32" },
		{ params: [], body: ["return 42"], returnAnnotation: "u8" },
		{
			params: ["value: u8 | null"],
			body: [
				"if (value == null) {",
				"    return 0 as u8",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: ["value: u8 | null"],
			body: ["return value"],
			returnAnnotation: "u8",
		},
		{
			params: ["value: u8 | null"],
			body: [
				"if (value == null) {",
				"    setup()",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: ["value: u8 | null"],
			body: [
				"if (value != null) {",
				"    return value",
				"}",
				"return 0 as u8",
			],
			returnAnnotation: "u8",
		},
		{
			params: ["value: u8 | null"],
			body: [
				"if (value == null) {",
				"    return 0 as u8",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: ["return null"],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: ["let value: u8 | null = null", "return value"],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    setup()",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return value",
				"}",
				"value = null",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value != null) {",
				"    return value",
				"}",
				"return 0 as u8",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    return value",
				"}",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    setup()",
				"}",
				"return true",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value != null) {",
				"    value = null",
				"    return value",
				"}",
				"return 0 as u8",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    value = null",
				"    return value",
				"}",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    value = null",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"}",
				"const reset = (value: u8): u8 => {",
				"    value = 0 as u8",
				"    return value",
				"}",
				"reset(0 as u8)",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let code: u8 = 0",
				"if (value == null) {",
				"    switch (code) {",
				"        case 1:",
				"            return 1 as u8",
				"        default:",
				"            return 0 as u8",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let code: u8 = 0",
				"if (value == null) {",
				"    switch (code) {",
				"        case 1:",
				"            return 1 as u8",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{ params: [], body: ["return 1000"], annotation: "boolean" },
		{ params: [], body: ["return 1000"], annotation: "i16" },
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value != null) {",
				"    value += 1",
				"    return 0 as u8",
				"}",
				"return 0 as u8",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value != null) {",
				"    value = value + 1",
				"    return 0 as u8",
				"}",
				"return 0 as u8",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"}",
				"value = value + 1",
				"return 0 as u8",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"while (value != null) {",
				"    value += 1",
				"}",
				"return 0 as u8",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else if (flag) {",
				"    value = null",
				"    return 1 as u8",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"}",
				"const reset = () => {",
				"    value = null",
				"}",
				"reset()",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    if (flag) {",
				"        value = null",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let code: u8 = 0",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    switch (code) {",
				"        case 1:",
				"            value = null",
				"            break",
				"        default:",
				"            break",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else if (flag) {",
				"    return 1 as u8",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    if (flag) {",
				"        return 1 as u8",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (flag) {",
				"        value = null",
				"        break",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (flag) {",
				"        value = null",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    for (let index: u8 = 0; index < 1; index += 1) {",
				"        value = null",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    do {",
				"        value = null",
				"    } while (flag)",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (flag) {",
				"        value += 1",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (true) {",
				"        value = null",
				"        break",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (true) {",
				"        return 1 as u8",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (flag) {",
				"        setup()",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (true) {",
				"        if (flag) {",
				"            value = null",
				"            return 1 as u8",
				"        }",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    for (;;) {",
				"        value = null",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    for (value = null; flag; value = null) {",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (false) {",
				"        value = null",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    for (; flag; value = null) {",
				"        flag = false",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    for (value = null; true; ) {",
				"        break",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    while (value = null) {",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    for (; value = null; ) {",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    do {",
				"    } while (value = null)",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
		{
			params: [],
			body: [
				"let value: u8 | null = null",
				"let flag: boolean = false",
				"if (value == null) {",
				"    return 0 as u8",
				"} else {",
				"    for (; flag; value = null) {",
				"        return 1 as u8",
				"    }",
				"}",
				"return value",
			],
			returnAnnotation: "u8",
		},
	];

	const header = [
		"// User function return type inference (inferFunctionReturnType + checker)",
		"// 'inferred' is the merged return type; 'CONFLICT' means the returns are",
		"// incompatible (no type contains all of them) and the checker flags it.",
		"// '(): T' is a return type annotation on the parentheses; the checker emits",
		"// returnTypeMismatch when the inferred type/value is not contained in it.",
		"// ': T' on the const name of a function emits functionTypeAnnotation (the",
		"// return type must be declared on the parameters, not the const name).",
		"// 'nullableOperation' flags arithmetic/member uses of a perhaps-null value.",
		"",
	];

	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const listFunctionReturnTypeSnapshots = () => {
	return listSnapshots("function-return-types.txt", buildReport());
};

export const writeFunctionReturnTypeSnapshots = () => {
	writeSnapshots(listFunctionReturnTypeSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeFunctionReturnTypeSnapshots();
	console.log("Generated function-return-types.txt");
}
