import { ERROR_CODE } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import {
	checkSource,
	createLibraries,
} from "./src/language/language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const buildSource = (lines) => {
	return lines.join("\n");
};

const checkLines = (lines, libraries = LIBRARIES) => {
	return checkSource(buildSource(lines), libraries).errors;
};

const filterByCode = (errors, errorCode) => {
	return errors.filter((error) => {
		return error.code === errorCode;
	});
};

const hasCode = (errors, errorCode) => {
	return filterByCode(errors, errorCode).length > 0;
};

const hasNamedCode = (errors, errorCode, name) => {
	return filterByCode(errors, errorCode).some((error) => {
		return error.params?.name === name;
	});
};

const MISSING_MAIN_CALL_LINES = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"}",
];

const checkMissingEntryCallReported = () => {
	const errors = checkLines(MISSING_MAIN_CALL_LINES);
	const [diagnostic] = filterByCode(errors, ERROR_CODE.entryPointNotCalled);
	return [
		expectEqual(
			"a declared but uncalled entry point is an error",
			hasNamedCode(errors, ERROR_CODE.entryPointNotCalled, "main"),
			true,
		),
		expectEqual(
			"the entry point error is not a warning",
			diagnostic?.severity,
			0,
		),
		expectEqual(
			"the entry point error points at the main declaration",
			[
				diagnostic?.location?.start?.line,
				diagnostic?.location?.start?.column,
			].join("|"),
			"2|7",
		),
	];
};

const checkEntryCallSuppressesUnusedMain = () => {
	const errors = checkLines(MISSING_MAIN_CALL_LINES);
	return expectEqual(
		"the entry error replaces the generic unused main warning",
		hasNamedCode(errors, ERROR_CODE.unusedFunction, "main"),
		false,
	);
};

const checkCalledEntryPointAccepted = () => {
	const errors = checkLines([...MISSING_MAIN_CALL_LINES, "main()"]);
	return [
		expectEqual(
			"a module-level main() satisfies the entry contract",
			hasCode(errors, ERROR_CODE.entryPointNotCalled),
			false,
		),
		expectEqual(
			"a called entry point is not reported as unused",
			hasNamedCode(errors, ERROR_CODE.unusedFunction, "main"),
			false,
		),
	];
};

const checkLibraryWithoutEntryAllowed = () => {
	const errors = checkLines(
		["const helper = () => {}"],
		createLibraries({ isLibrary: true }),
	);
	return [
		expectEqual(
			"a library without main is not an entry point",
			hasCode(errors, ERROR_CODE.entryPointNotCalled),
			false,
		),
		expectEqual(
			"a library without main does not require the entry functions",
			hasCode(errors, ERROR_CODE.missingRequiredFunction),
			false,
		),
	];
};

const checkOtherFunctionsUnaffected = () => {
	const errors = checkLines([
		"const helper = () => {}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"}",
		"main()",
	]);
	return [
		expectEqual(
			"an unused helper keeps its unused-function warning",
			hasNamedCode(errors, ERROR_CODE.unusedFunction, "helper"),
			true,
		),
		expectEqual(
			"an unused helper does not trigger the entry point error",
			hasCode(errors, ERROR_CODE.entryPointNotCalled),
			false,
		),
	];
};

const checkIntermediateModuleNotEntry = () => {
	const errors = checkLines(
		MISSING_MAIN_CALL_LINES,
		createLibraries({
			isEntry: false,
		}),
	);
	return expectEqual(
		"an intermediate module does not enforce the entry contract",
		hasCode(errors, ERROR_CODE.entryPointNotCalled),
		false,
	);
};

const checkMissingSetupCallStillReported = () => {
	const errors = checkLines([
		"const setup = () => {}",
		"const main = () => {",
		"    const started = true",
		"    setup()",
		"}",
		"main()",
	]);
	return [
		expectEqual(
			"setup not being the first statement still reports missingSetupCall",
			hasCode(errors, ERROR_CODE.missingSetupCall),
			true,
		),
		expectEqual(
			"a called entry point is not reported as uncalled",
			hasCode(errors, ERROR_CODE.entryPointNotCalled),
			false,
		),
	];
};

const checkNestedEntryCallDoesNotCount = () => {
	const errors = checkLines([
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"}",
		"const runMain = () => {",
		"    main()",
		"}",
	]);
	return expectEqual(
		"a main() call nested in a function does not satisfy the entry contract",
		hasNamedCode(errors, ERROR_CODE.entryPointNotCalled, "main"),
		true,
	);
};

export const runEntryPointChecks = () => {
	return [
		...checkMissingEntryCallReported(),
		checkEntryCallSuppressesUnusedMain(),
		...checkCalledEntryPointAccepted(),
		...checkLibraryWithoutEntryAllowed(),
		...checkOtherFunctionsUnaffected(),
		checkIntermediateModuleNotEntry(),
		...checkMissingSetupCallStillReported(),
		checkNestedEntryCallDoesNotCount(),
	];
};
