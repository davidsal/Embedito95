import { ERROR_CODE } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import {
	checkSource,
	createLibraries,
} from "./src/language/language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const PERSONA_PREAMBLE = [
	"type Persona = { name: string, age: i32 }",
	'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
];

const buildSource = (lines) => {
	return lines.join("\n");
};

const checkLines = (lines) => {
	return checkSource(buildSource(lines), LIBRARIES).errors;
};

const filterByCode = (errors, errorCode) => {
	return errors.filter((error) => {
		return error.code === errorCode;
	});
};

const unusedConstantErrors = (errors) => {
	return filterByCode(errors, ERROR_CODE.unusedConstant);
};

const unusedConstantNames = (errors) => {
	return unusedConstantErrors(errors).map((error) => {
		return error.params?.name;
	});
};

const unusedConstantLines = (errors, name) => {
	return unusedConstantErrors(errors)
		.filter((error) => {
			return error.params?.name === name;
		})
		.map((error) => {
			return error.location?.start?.line;
		});
};

const hasWarning = (errors, errorCode, name) => {
	return errors.some((error) => {
		return error.code === errorCode && error.params?.name === name;
	});
};

const checkShadowingAcrossFunctions = () => {
	const errors = checkLines([
		...PERSONA_PREAMBLE,
		"const other = () => {",
		"    const persona = 1",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const persona = 2",
		`    const x = \`\${persona}\``,
		"}",
	]);
	const personaLines = unusedConstantLines(errors, "persona");
	return [
		expectEqual(
			"a shadowed unused local in another function is reported once",
			personaLines.join(","),
			"4",
		),
		expectEqual(
			"the shadowing warning points at the other function declaration",
			personaLines[0],
			4,
		),
		expectEqual(
			"an unused function in the other scope is still reported",
			hasWarning(errors, ERROR_CODE.unusedFunction, "other"),
			true,
		),
		expectEqual(
			"an unused template result is still reported",
			unusedConstantNames(errors).includes("x"),
			true,
		),
	];
};

const checkNestedBlockReuse = () => {
	const errors = checkLines([
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const persona = 1",
		`    const used = \`\${persona}\``,
		"    if (persona > 0) {",
		"        const persona = 2",
		"    }",
		"}",
	]);
	const personaLines = unusedConstantLines(errors, "persona");
	return [
		expectEqual(
			"only the unused declaration in the nested block is reported",
			personaLines.join(","),
			"7",
		),
		expectEqual(
			"the used outer declaration is not reported",
			personaLines.length,
			1,
		),
	];
};

const checkUsedParameterKeepsOtherLocalUnused = () => {
	const errors = checkLines([
		"const other = (persona: i32) => {",
		`    const value = \`\${persona}\``,
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const persona = 2",
		"}",
	]);
	return [
		expectEqual(
			"a parameter used in its function does not silence a local in another function",
			unusedConstantLines(errors, "persona").join(","),
			"7",
		),
		expectEqual(
			"the unused local of the parameter function is still reported",
			unusedConstantLines(errors, "value").join(","),
			"2",
		),
	];
};

const checkUsedLocalKeepsOtherParameterSilent = () => {
	const errors = checkLines([
		"const other = (persona: i32) => {}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const persona = 2",
		`    const used = \`\${persona}\``,
		"}",
	]);
	return [
		expectEqual(
			"a used local does not generate an unused warning",
			unusedConstantLines(errors, "persona").join(","),
			"",
		),
		expectEqual(
			"a used local does not generate a new parameter warning",
			hasWarning(errors, ERROR_CODE.unusedConstant, "persona"),
			false,
		),
		expectEqual(
			"the unused local of the same scope is still reported",
			unusedConstantLines(errors, "used").join(","),
			"6",
		),
	];
};

const checkAsyncTestShadowing = () => {
	const errors = checkLines([
		...PERSONA_PREAMBLE,
		"const asyncTest = async () => {",
		"    const persona = getPersona()",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const persona = getPersona()",
		`    const value = \`\${persona}\``,
		"}",
	]);
	return expectEqual(
		"an asyncTest local is reported despite a used homonym in main",
		unusedConstantLines(errors, "persona").join(","),
		"4",
	);
};

const checkSameScopeUsageStillCounts = () => {
	const errors = checkLines([
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const persona = 2",
		`    const value = \`\${persona}\``,
		"}",
	]);
	return [
		expectEqual(
			"a local used in the same scope is not reported",
			unusedConstantLines(errors, "persona").join(","),
			"",
		),
		expectEqual(
			"the unused sibling local is still reported",
			unusedConstantLines(errors, "value").join(","),
			"5",
		),
	];
};

const checkTopLevelUsageUnchanged = () => {
	const errors = checkLines([
		"const first = 1",
		"const second = 2",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		`    const value = \`\${first}\``,
		"}",
	]);
	const names = unusedConstantNames(errors).sort();
	return expectEqual(
		"top-level declarations keep their unused signals",
		names.join(","),
		"second,value",
	);
};

const checkGlobalUsedWithShadowedLocal = () => {
	const errors = checkLines([
		"const shared = 1",
		"const setup = () => {}",
		"const other = () => {",
		"    const shared = 2",
		"}",
		"const main = () => {",
		"    setup()",
		`    const value = \`\${shared}\``,
		"}",
	]);
	return [
		expectEqual(
			"a reference from another scope keeps the global used",
			unusedConstantLines(errors, "shared").join(","),
			"4",
		),
		expectEqual(
			"the shadowed local is the only reported declaration",
			hasWarning(errors, ERROR_CODE.unusedConstant, "value"),
			true,
		),
	];
};

export const runUnusedScopeChecks = () => {
	return [
		...checkShadowingAcrossFunctions(),
		...checkNestedBlockReuse(),
		...checkUsedParameterKeepsOtherLocalUnused(),
		...checkUsedLocalKeepsOtherParameterSilent(),
		checkAsyncTestShadowing(),
		...checkSameScopeUsageStillCounts(),
		checkTopLevelUsageUnchanged(),
		...checkGlobalUsedWithShadowedLocal(),
	];
};
