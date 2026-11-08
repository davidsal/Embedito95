import { readFileSync } from "node:fs";
import {
	resolveIntegerType as resolveCoreIntegerType,
	UTF8,
} from "embedito95-core";
import { TYPE_RANGES } from "../core/src/checker/types.js";
import { resolveIntegerType as resolveRegistryIntegerType } from "../registry/src/strategies/shared/int-type-resolution.js";
import { REGISTRY_INT_TYPE_RESOLUTION_FILE } from "./constants.js";
import { expectEqual } from "./reporting.js";

// Behavior and table parity for the two copies of `resolveIntegerType`. The
// `registry` ↔ `core` wall (TICKET-35) forces `registry` to keep a
// self-contained copy: `registry/package.json` declares no dependencies, `core`
// already imports `registry`, and strategies are loaded as plain files, so a
// bare `embedito95-core` import from `registry` would be a phantom dependency
// and a package cycle. The copies may only drift if a guard notices, so these
// checks compare the registry copy against the canonical core copy on inputs
// that exercise every branch (min < 0, preferSigned, and the unsigned path
// including its fallback), and both copies' range tables value by value.
//
// The fallback branch (`max` above u32) is unreachable with the declared
// platforms (SRAM and analog maxima stay below `u32.max`), but it is still
// asserted explicitly: it must resolve to `u64`, never `i64`. This is the
// check that bites if the registry copy ever reverts to the old signed answer.
const UNSIGNED_FALLBACK_MIN = 0;
const UNSIGNED_FALLBACK_MAX = TYPE_RANGES.u32.max + 1;

const NEGATIVE_BRANCH_CASES = [
	{ label: "smallest negative magnitude", min: -1, max: -1 },
	{ label: "i8 minimum", min: -128, max: 127 },
	{ label: "past i8 minimum", min: -129, max: 0 },
	{ label: "i16 minimum", min: -32768, max: 0 },
	{ label: "past i16 minimum", min: -32769, max: 0 },
	{ label: "i32 minimum", min: -2147483648, max: 0 },
	{ label: "past i32 minimum", min: -2147483649, max: 0 },
	{ label: "positive max dominates the limit", min: -1, max: 200 },
	{ label: "positive max crosses i16", min: -1, max: 40000 },
	{ label: "positive max crosses u32", min: -1, max: 4294967296 },
];

const PREFER_SIGNED_BRANCH_CASES = [
	{ label: "preferSigned zero", min: 0, max: 0 },
	{ label: "preferSigned i8 max", min: 0, max: 127 },
	{ label: "preferSigned past i8 max", min: 0, max: 128 },
	{ label: "preferSigned u8 max", min: 0, max: 255 },
	{ label: "preferSigned past u8 max", min: 0, max: 256 },
	{ label: "preferSigned i16 max", min: 0, max: 32767 },
	{ label: "preferSigned past i16 max", min: 0, max: 32768 },
	{ label: "preferSigned u16 max", min: 0, max: 65535 },
	{ label: "preferSigned past u16 max", min: 0, max: 65536 },
	{ label: "preferSigned i32 max", min: 0, max: 2147483647 },
	{ label: "preferSigned past i32 max", min: 0, max: 2147483648 },
	{ label: "preferSigned u32 max", min: 0, max: 4294967295 },
	{ label: "preferSigned fallback above u32", min: 0, max: 4294967296 },
];

const UNSIGNED_BRANCH_CASES = [
	{ label: "unsigned zero", min: 0, max: 0 },
	{ label: "unsigned u8 max", min: 0, max: 255 },
	{ label: "unsigned past u8 max", min: 0, max: 256 },
	{ label: "unsigned u16 max", min: 0, max: 65535 },
	{ label: "unsigned past u16 max", min: 0, max: 65536 },
	{ label: "unsigned u32 max", min: 0, max: 4294967295 },
	{ label: "unsigned fallback above u32", min: 0, max: 4294967296 },
];

const INTEGER_TYPE_CASES = [
	...NEGATIVE_BRANCH_CASES.map((testCase) => {
		return { ...testCase, preferSigned: false };
	}),
	...PREFER_SIGNED_BRANCH_CASES.map((testCase) => {
		return { ...testCase, preferSigned: true };
	}),
	...UNSIGNED_BRANCH_CASES.map((testCase) => {
		return { ...testCase, preferSigned: false };
	}),
];

const RANGE_CONSTANT_PARITY = [
	{ registryName: "RANGE_U8", coreType: "u8" },
	{ registryName: "RANGE_I8", coreType: "i8" },
	{ registryName: "RANGE_U16", coreType: "u16" },
	{ registryName: "RANGE_I16", coreType: "i16" },
	{ registryName: "RANGE_U32", coreType: "u32" },
	{ registryName: "RANGE_I32", coreType: "i32" },
];

const parseRangeConstant = (source, name) => {
	const match = source.match(
		new RegExp(
			`const\\s+${name}\\s*=\\s*\\{\\s*min:\\s*(-?\\d+)\\s*,\\s*max:\\s*(-?\\d+)\\s*\\}`,
		),
	);

	if (!match) {
		return null;
	}

	return { min: Number(match[1]), max: Number(match[2]) };
};

const serializeRange = (range) => {
	return range ? `${range.min}..${range.max}` : null;
};

const checkBehaviorParity = () => {
	return INTEGER_TYPE_CASES.map(({ label, min, max, preferSigned }) => {
		return expectEqual(
			`resolveIntegerType parity (${label})`,
			resolveRegistryIntegerType(min, max, preferSigned),
			resolveCoreIntegerType(min, max, preferSigned),
		);
	});
};

const checkUnsignedFallbackReturnsU64 = () => {
	return [
		expectEqual(
			"registry unsigned fallback above u32 returns u64",
			resolveRegistryIntegerType(UNSIGNED_FALLBACK_MIN, UNSIGNED_FALLBACK_MAX),
			"u64",
		),
		expectEqual(
			"registry unsigned fallback above u32 matches core",
			resolveRegistryIntegerType(UNSIGNED_FALLBACK_MIN, UNSIGNED_FALLBACK_MAX),
			resolveCoreIntegerType(UNSIGNED_FALLBACK_MIN, UNSIGNED_FALLBACK_MAX),
		),
	];
};

const checkRangeTableParity = () => {
	const source = readFileSync(REGISTRY_INT_TYPE_RESOLUTION_FILE, UTF8);

	return RANGE_CONSTANT_PARITY.map(({ registryName, coreType }) => {
		return expectEqual(
			`registry ${registryName} matches core TYPE_RANGES.${coreType}`,
			serializeRange(parseRangeConstant(source, registryName)),
			serializeRange(TYPE_RANGES[coreType]),
		);
	});
};

export const runRegistryIntTypeParityChecks = () => {
	return [
		...checkBehaviorParity(),
		...checkUnsignedFallbackReturnsU64(),
		...checkRangeTableParity(),
	];
};
