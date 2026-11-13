import { check, resolveWordDataType } from "embedito95-core";
import { platforms } from "embedito95-registry/platforms";
import { applyWordMinimum } from "../core/src/checker/type-resolution.js";
import { expectEqual } from "./reporting.js";
import {
	collectProbes,
	createLibraries,
	parseSource,
} from "./src/language/language-snapshot-harness.mjs";

// `specs.wordSize` is the native integer register width of a platform. Untyped
// `let` declarations and integer promotions widen to it, so the same source
// yields i16 on AVR, i32 on Cortex-M and i64 on ARM64/x64 hosts.
const MACOS_ARM64_PLATFORM = "macos-arm64";
const WORD_SIZE_CASES = [
	{ wordSize: 16, wordType: "i16" },
	{ wordSize: 32, wordType: "i32" },
	{ wordSize: 64, wordType: "i64" },
];
const WORD_MINIMUM_CASES = [
	{ type: "u8", wordSize: 16, expected: "i16" },
	{ type: "u8", wordSize: 32, expected: "i32" },
	{ type: "u8", wordSize: 64, expected: "i64" },
	{ type: "u16", wordSize: 32, expected: "i32" },
	{ type: "u16", wordSize: 64, expected: "i64" },
	{ type: "i8", wordSize: 64, expected: "i64" },
	{ type: "u64", wordSize: 64, expected: "u64" },
];
const LET_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    let var1 = 12",
	"}",
	"main()",
].join("\n");

const checkResolveWordDataType = () => {
	return WORD_SIZE_CASES.map(({ wordSize, wordType }) => {
		return expectEqual(
			`resolveWordDataType returns ${wordType} for a ${wordSize}-bit word`,
			resolveWordDataType(wordSize),
			wordType,
		);
	});
};

const resolveLetVariableType = (wordSize) => {
	const { ast, comments } = parseSource(LET_SOURCE);
	const { variableTypes } = check(ast, {
		...createLibraries(),
		comments,
		source: LET_SOURCE,
		wordSize,
	});
	const probe = collectProbes(ast, new Set(["var1"]))[0];
	return variableTypes.resolve(probe?.name, probe?.location);
};

const checkLetUsesNativeWord = () => {
	return WORD_SIZE_CASES.map(({ wordSize, wordType }) => {
		return expectEqual(
			`let widens to ${wordType} on a ${wordSize}-bit target`,
			resolveLetVariableType(wordSize),
			wordType,
		);
	});
};

const checkWordMinimumPromotion = () => {
	return WORD_MINIMUM_CASES.map(({ type, wordSize, expected }) => {
		return expectEqual(
			`applyWordMinimum widens ${type} to ${expected} on a ${wordSize}-bit word`,
			applyWordMinimum(type, wordSize),
			expected,
		);
	});
};

const findPlatform = (platformName) => {
	return platforms.find((candidate) => {
		return candidate.name === platformName;
	});
};

const checkMacosArm64Specs = () => {
	const specs = findPlatform(MACOS_ARM64_PLATFORM)?.specs;

	return [
		expectEqual(
			"macos-arm64 declares a 64-bit native word",
			specs?.wordSize,
			64,
		),
		expectEqual(
			"macos-arm64 declares its ARM64 architecture",
			specs?.architecture,
			"ARM64",
		),
		expectEqual(
			"macos-arm64 declares that flash strings are not PROGMEM",
			specs?.progmem,
			false,
		),
	];
};

export const runWordSizeChecks = () => {
	return [
		...checkResolveWordDataType(),
		...checkLetUsesNativeWord(),
		...checkWordMinimumPromotion(),
		...checkMacosArm64Specs(),
	];
};
