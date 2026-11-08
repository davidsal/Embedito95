import { readFileSync } from "node:fs";
import { UTF8 } from "embedito95-core";
import { REGISTRY_INT128_TEMPLATE_FILE } from "./constants.js";
import { expectEqual } from "./reporting.js";

// Regression guard for the latent bug fixed in TICKET-18. `String::String(i128)`
// negated a negative i128 with `u128(~raw.lo, ~raw.hi)` + 1, but the
// `u128(high, low)` constructor takes high first, so the call swapped hi/lo and
// printed a magnitude with inverted words (~1.8e19 instead of the real value).
// The two's-complement negation now lives in the single `_e95_negateU128` helper,
// which negates the whole u128 with the words in the right order. These checks fail
// if the buggy swap ever comes back or the negation gets duplicated inline.
const SHARED_NEGATION_HELPER_PATTERN = /static\s+u128\s+_e95_negateU128\s*\(/g;
const STRING_NEGATION_VIA_HELPER_PATTERN =
	/\bu128\s+magnitude\s*=\s*_e95_negateU128\(raw\)\s*;/;
const BUGGY_STRING_NEGATION_PATTERN = /u128\(\s*~raw\.lo\s*,\s*~raw\.hi\s*\)/;
const INLINE_NEGATION_PATTERN = /~\s*[A-Za-z_]\w*(?:\.\w+)?\s*\+\s*u128\(1\)/g;
const MAXIMUM_INLINE_NEGATIONS = 1;

const readInt128Template = () => {
	return readFileSync(REGISTRY_INT128_TEMPLATE_FILE, UTF8);
};

const countMatches = (content, pattern) => {
	return content.match(pattern)?.length ?? 0;
};

export const runRegistryInt128NegationChecks = () => {
	const templateContent = readInt128Template();

	return [
		expectEqual(
			"int128 template defines the two's-complement negation exactly once",
			countMatches(templateContent, SHARED_NEGATION_HELPER_PATTERN),
			1,
		),
		expectEqual(
			"String::String(i128) negates through the shared helper",
			STRING_NEGATION_VIA_HELPER_PATTERN.test(templateContent),
			true,
		),
		expectEqual(
			"String::String(i128) never swaps the u128(high, low) words",
			BUGGY_STRING_NEGATION_PATTERN.test(templateContent),
			false,
		),
		expectEqual(
			"two's-complement negation is not spelled inline outside the helper",
			countMatches(templateContent, INLINE_NEGATION_PATTERN) <=
				MAXIMUM_INLINE_NEGATIONS,
			true,
		),
	];
};
