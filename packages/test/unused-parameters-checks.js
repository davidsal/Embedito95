import { ERROR_CODE } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import {
	checkSource,
	createLibraries,
} from "./src/language/language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

// A library function whose parameters live outside the user AST: it must never
// produce an unused-parameter warning in the user program.
const LIBRARY_NAME = "@embedito95/fake-timer";
const LIBRARY_LIBRARIES = createLibraries({
	knownLibraries: new Set([LIBRARY_NAME]),
	libraryExports: {
		[LIBRARY_NAME]: new Set(["waitFor"]),
	},
	libraryFunctions: {
		[LIBRARY_NAME]: {
			waitFor: {
				params: [
					{ name: "duration", type: "u32" },
					{ name: "callback", type: "i32" },
				],
				returnType: "boolean",
			},
		},
	},
});

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

const unusedParameterErrors = (errors) => {
	return filterByCode(errors, ERROR_CODE.unusedParameter);
};

const unusedParameterNames = (errors) => {
	return unusedParameterErrors(errors).map((error) => {
		return error.params?.name;
	});
};

const hasUnusedParameter = (errors, name) => {
	return unusedParameterErrors(errors).some((error) => {
		return error.params?.name === name;
	});
};

const checkSingleUnusedParameter = () => {
	const errors = checkLines([
		"const f = (unused: i32) => { return 1 }",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    f(1)",
		"}",
	]);
	return [
		expectEqual(
			"an unused arrow parameter is reported once",
			unusedParameterNames(errors).join(","),
			"unused",
		),
		expectEqual(
			"the unused parameter does not become an unused function",
			hasUnusedParameter(errors, "f"),
			false,
		),
	];
};

const checkOnlyUnusedParameterOfPair = () => {
	const errors = checkLines([
		"const f = (unused: i32, used: string) => { return used }",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		'    const value = f(1, "x")',
		"}",
	]);
	return expectEqual(
		"only the unused parameter of a pair is reported",
		unusedParameterNames(errors).join(","),
		"unused",
	);
};

const checkObjectMethodParameters = () => {
	const errors = checkLines([
		"type Handlers = { ignored: (unusedValue: i32) => i32, kept: (usedValue: i32) => i32 }",
		"const build = (): Handlers => {",
		"    return {",
		"        ignored: (unusedValue: i32) => { return 1 },",
		"        kept: (usedValue: i32) => { return usedValue },",
		"    }",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const handlers = build()",
		"}",
	]);
	return expectEqual(
		"object method parameters are checked like arrow parameters",
		unusedParameterNames(errors).join(","),
		"unusedValue",
	);
};

const checkNestedScopeUsage = () => {
	const errors = checkLines([
		"const f = (value: i32) => {",
		"    if (value > 0) {",
		"        const doubled = value + value",
		"    }",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    f(1)",
		"}",
	]);
	return expectEqual(
		"a parameter used in a nested scope counts as used",
		hasUnusedParameter(errors, "value"),
		false,
	);
};

const checkParameterShadowingUsedGlobal = () => {
	const errors = checkLines([
		"const shared = 1",
		"const useParameter = (shared: i32) => { return shared }",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const fromParameter = useParameter(2)",
		"    const fromGlobal = shared",
		"}",
	]);
	return [
		expectEqual(
			"a used parameter shadowing a used global is not reported",
			hasUnusedParameter(errors, "shared"),
			false,
		),
		expectEqual(
			"the used global keeps its used status",
			filterByCode(errors, ERROR_CODE.unusedConstant).some((error) => {
				return error.params?.name === "shared";
			}),
			false,
		),
	];
};

const checkUnusedParameterShadowingUsedGlobal = () => {
	const errors = checkLines([
		"const shared = 1",
		"const useParameter = (shared: i32) => { return 1 }",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const fromParameter = useParameter(2)",
		"    const fromGlobal = shared",
		"}",
	]);
	return [
		expectEqual(
			"an unused parameter shadowing a used global is reported",
			hasUnusedParameter(errors, "shared"),
			true,
		),
		expectEqual(
			"the shadowed global is not reported as unused",
			filterByCode(errors, ERROR_CODE.unusedConstant).some((error) => {
				return error.params?.name === "shared";
			}),
			false,
		),
	];
};

const checkBranchOnlyUsage = () => {
	const errors = checkLines([
		"const f = (value: i32) => {",
		"    if (value > 0) {",
		"        return value",
		"    }",
		"    return 0",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    f(1)",
		"}",
	]);
	return expectEqual(
		"a parameter used only inside an if branch counts as used",
		hasUnusedParameter(errors, "value"),
		false,
	);
};

const checkUnderscorePrefixPolicy = () => {
	const errors = checkLines([
		"const onEvent = (event: i32) => { return 1 }",
		"const onIgnoredEvent = (_event: i32, _unused: string) => { return 1 }",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    onEvent(1)",
		'    onIgnoredEvent(2, "x")',
		"}",
	]);
	return [
		expectEqual(
			"a callback parameter without the underscore prefix is reported",
			hasUnusedParameter(errors, "event"),
			true,
		),
		expectEqual(
			"underscore-prefixed callback parameters are intentionally ignored",
			unusedParameterNames(errors).filter((name) => {
				return name.startsWith("_");
			}).length,
			0,
		),
	];
};

const checkParameterShadowedByUnusedLocal = () => {
	const errors = checkLines([
		"const f = (value: i32) => {",
		"    const value = 1",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    f(1)",
		"}",
	]);
	return [
		expectEqual(
			"a parameter shadowed by an unused local still reports the parameter",
			hasUnusedParameter(errors, "value"),
			true,
		),
		expectEqual(
			"the shadowing local keeps its own unused warning",
			filterByCode(errors, ERROR_CODE.unusedConstant).some((error) => {
				return error.params?.name === "value";
			}),
			true,
		),
	];
};

const checkUsedParameterWithShadowingNestedLocal = () => {
	const errors = checkLines([
		"const f = (value: i32) => {",
		"    if (value > 0) {",
		"        const value = 1",
		"    }",
		"}",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    f(1)",
		"}",
	]);
	return [
		expectEqual(
			"an inner local does not hide a parameter used outside its block",
			hasUnusedParameter(errors, "value"),
			false,
		),
		expectEqual(
			"the unused inner local is still reported",
			filterByCode(errors, ERROR_CODE.unusedConstant).some((error) => {
				return error.params?.name === "value";
			}),
			true,
		),
	];
};

const checkLibraryParametersUntouched = () => {
	const errors = checkLines(
		["const setup = () => {}", "const main = () => {", "    setup()", "}"],
		LIBRARY_LIBRARIES,
	);
	return expectEqual(
		"library function parameters never produce unused-parameter warnings",
		unusedParameterErrors(errors).length,
		0,
	);
};

const checkParameterLocation = () => {
	const errors = checkLines([
		"const f = (unused: i32) => { return 1 }",
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    f(1)",
		"}",
	]);
	const [diagnostic] = unusedParameterErrors(errors);
	return expectEqual(
		"the warning points at the parameter name",
		[
			diagnostic?.location?.start?.line,
			diagnostic?.location?.start?.column,
			diagnostic?.severity,
		].join("|"),
		"1|12|1",
	);
};

export const runUnusedParameterChecks = () => {
	return [
		...checkSingleUnusedParameter(),
		checkOnlyUnusedParameterOfPair(),
		checkObjectMethodParameters(),
		checkNestedScopeUsage(),
		...checkParameterShadowingUsedGlobal(),
		...checkUnusedParameterShadowingUsedGlobal(),
		checkBranchOnlyUsage(),
		...checkUnderscorePrefixPolicy(),
		...checkParameterShadowedByUnusedLocal(),
		...checkUsedParameterWithShadowingNestedLocal(),
		checkLibraryParametersUntouched(),
		checkParameterLocation(),
	];
};
