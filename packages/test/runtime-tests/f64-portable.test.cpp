// Host runtime tests for the portable binary64 implementation
// (strategies/shared/f64/f64.cpp). The struct stores the raw IEEE-754 bits and
// performs arithmetic by software, so on the AVR (where the compiler `double`
// is only 32 bits) `f64` keeps 64-bit precision. The reference is the host
// native `double`: every result may differ by at most one unit in the last
// place, which is the rounding slack of the software operations.

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <core_f64.h>

#include "packages/registry/src/strategies/shared/f64/f64.cpp"

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                      \
			failures++;                                                          \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);          \
		}                                                                        \
	} while (0)

static uint64_t bitsOfDouble(double value) {
	uint64_t bits = 0;
	memcpy(&bits, &value, sizeof(value));
	return bits;
}

static _e95_f64 portableFromDouble(double value) {
	const uint64_t bits = bitsOfDouble(value);
	return _e95_f64::fromBits((uint32_t)(bits >> 32), (uint32_t)bits);
}

// Maps the sign-magnitude bit pattern to a monotonic integer so adjacent
// representable values have adjacent keys (NaNs are excluded from comparison).
static uint64_t orderedBits(uint64_t bits) {
	const uint64_t signBit = 0x8000000000000000ULL;
	return (bits & signBit) != 0 ? ~bits : bits | signBit;
}

static bool isNanBitPattern(uint64_t bits) {
	return (bits & 0x7FF0000000000000ULL) == 0x7FF0000000000000ULL &&
	       (bits & 0x000FFFFFFFFFFFFFULL) != 0;
}

static bool withinOneUlp(uint64_t actualBits, uint64_t expectedBits) {
	if (isNanBitPattern(actualBits) || isNanBitPattern(expectedBits)) {
		return isNanBitPattern(actualBits) && isNanBitPattern(expectedBits);
	}
	const uint64_t actual = orderedBits(actualBits);
	const uint64_t expected = orderedBits(expectedBits);
	return actual >= expected ? actual - expected <= 1 : expected - actual <= 1;
}

static void expectClose(const char *label, _e95_f64 actual, double expected) {
	if (!withinOneUlp(actual.bits, bitsOfDouble(expected))) {
		failures++;
		printf(
			"FAIL %s: got 0x%016llx expected 0x%016llx\n",
			label,
			(unsigned long long)actual.bits,
			(unsigned long long)bitsOfDouble(expected)
		);
	}
}

static void expectBits(const char *label, _e95_f64 actual, double expected) {
	if (actual.bits != bitsOfDouble(expected)) {
		failures++;
		printf(
			"FAIL %s: got 0x%016llx expected 0x%016llx\n",
			label,
			(unsigned long long)actual.bits,
			(unsigned long long)bitsOfDouble(expected)
		);
	}
}

static void scenarioRepresentation() {
	expectBits("zero", portableFromDouble(0.0), 0.0);
	expectBits("negative zero", portableFromDouble(-0.0), -0.0);
	expectBits("one", portableFromDouble(1.0), 1.0);
	expectBits("negative one", portableFromDouble(-1.0), -1.0);
	expectBits("1e308", portableFromDouble(1e308), 1e308);
	expectBits("1e-308", portableFromDouble(1e-308), 1e-308);
	expectBits(
		"fifteen significant digits",
		portableFromDouble(0.1234567890123456789),
		0.1234567890123456789
	);
}

static void scenarioAddition() {
	expectClose("0.1 + 0.2", portableFromDouble(0.1) + portableFromDouble(0.2), 0.1 + 0.2);
	expectClose("1 + 2", portableFromDouble(1.0) + portableFromDouble(2.0), 3.0);
	expectClose("-2.5 + 0.5", portableFromDouble(-2.5) + portableFromDouble(0.5), -2.0);
	expectClose("small + large", portableFromDouble(1e-300) + portableFromDouble(1.0), 1.0);
}

static void scenarioSubtraction() {
	expectClose("1 - 3", portableFromDouble(1.0) - portableFromDouble(3.0), -2.0);
	expectClose("0.3 - 0.2", portableFromDouble(0.3) - portableFromDouble(0.2), 0.3 - 0.2);
	expectClose("2^53 - 1", portableFromDouble(9007199254740992.0) - portableFromDouble(1.0), 9007199254740991.0);
}

static void scenarioMultiplication() {
	expectClose("1/3 * 3", (portableFromDouble(1.0) / portableFromDouble(3.0)) * portableFromDouble(3.0), 1.0);
	expectClose("2^53 * 2", portableFromDouble(9007199254740992.0) * portableFromDouble(2.0), 18014398509481984.0);
	expectClose("negative * negative", portableFromDouble(-1.5) * portableFromDouble(-2.0), 3.0);
	expectClose("tiny * tiny", portableFromDouble(1e-200) * portableFromDouble(1e-200), 0.0);
}

static void scenarioDivision() {
	expectClose("1 / 3", portableFromDouble(1.0) / portableFromDouble(3.0), 1.0 / 3.0);
	expectClose("10 / 4", portableFromDouble(10.0) / portableFromDouble(4.0), 2.5);
	expectClose("negative / positive", portableFromDouble(-7.0) / portableFromDouble(2.0), -3.5);
	expectClose("1 / 0", portableFromDouble(1.0) / portableFromDouble(0.0), 1.0 / 0.0);
	expectClose("-1 / 0", portableFromDouble(-1.0) / portableFromDouble(0.0), -1.0 / 0.0);
	expectClose("0 / 0", portableFromDouble(0.0) / portableFromDouble(0.0), 0.0 / 0.0);
}

static void scenarioPowersOfTwo() {
	const double twoTo53 = 9007199254740992.0;
	const double next = 9007199254740994.0;
	expectClose("2^53", portableFromDouble(twoTo53), twoTo53);
	expectClose("2^53 + 2", portableFromDouble(twoTo53) + portableFromDouble(2.0), next);
	expectClose("2^53 + 1 rounds to 2^53", portableFromDouble(twoTo53) + portableFromDouble(1.0), twoTo53);
}

static void scenarioComparisons() {
	const _e95_f64 zero = portableFromDouble(0.0);
	const _e95_f64 one = portableFromDouble(1.0);
	const _e95_f64 two = portableFromDouble(2.0);
	const _e95_f64 negative = portableFromDouble(-1.0);

	CHECK(one == one);
	CHECK(one != two);
	CHECK(negative < zero);
	CHECK(two > one);
	CHECK(one <= one);
	CHECK(two >= one);
	CHECK(!(one < negative));
	CHECK(portableFromDouble(-0.0) == zero);
}

static void scenarioConversions() {
	expectClose("from int", _e95_f64(42), 42.0);
	expectClose("from negative int", _e95_f64(-42), -42.0);
	expectClose("from float", _e95_f64(0.5f), 0.5);
	expectClose("from double", _e95_f64(0.1), 0.1);
	CHECK((int)portableFromDouble(42.9) == 42);
	CHECK((int)portableFromDouble(-42.9) == -42);
	CHECK((float)portableFromDouble(0.25) == 0.25f);
}

static void scenarioCompoundAssignment() {
	_e95_f64 value = portableFromDouble(1.5);
	value += portableFromDouble(0.5);
	value -= portableFromDouble(1.0);
	value *= portableFromDouble(4.0);
	value /= portableFromDouble(2.0);
	expectClose("compound assignment", value, 2.0);
}

int main() {
	scenarioRepresentation();
	scenarioAddition();
	scenarioSubtraction();
	scenarioMultiplication();
	scenarioDivision();
	scenarioPowersOfTwo();
	scenarioComparisons();
	scenarioConversions();
	scenarioCompoundAssignment();

	if (failures == 0) {
		printf("F64-portable: all scenarios passed\n");
		return 0;
	}
	printf("F64-portable: %d check(s) failed\n", failures);
	return 1;
}
