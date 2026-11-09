// Host compile+behaviour guard for the 128-bit integer to binary64 conversion
// (strategies/shared/int128/int128.cpp). The real generated STM32 translation
// unit is compiled, so the shared template is exercised as emitted: the
// conversion must keep the high word and return the full magnitude instead of
// only the low word. The high-word factor is 2^64, which is an exact power of
// two in native binary64 and in the 32-bit `double` of AVR, but does not fit in
// `unsigned long long`.
//
// The generated STM32 file is used because it links cleanly on the host; the
// AVR software binary64 path is compiled by `test:compile` on the real AVR
// toolchain.

#include "packages/test/src/stm32-bluepill/snapshots/engine/type/core_int128.cpp"
#include "packages/test/src/stm32-bluepill/snapshots/engine/type/core_string.cpp"

#include <limits.h>
#include <stdint.h>
#include <stdio.h>

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                      \
			failures++;                                                          \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);          \
		}                                                                        \
	} while (0)

static void expectDouble(const char *label, f64 actual, double expected) {
	if (actual != expected) {
		failures++;
		printf(
			"FAIL %s: got %.17g expected %.17g\n",
			label,
			(double)actual,
			expected
		);
	}
}

static void scenarioUnsignedHighWord() {
	expectDouble(
		"1 << 63",
		(f64)u128(0, (u64)1 << 63),
		9223372036854775808.0
	);
	expectDouble(
		"2^64",
		(f64)u128(1, 0),
		18446744073709551616.0
	);
	expectDouble(
		"2^64 + 1 rounds to 2^64",
		(f64)u128(1, 1),
		18446744073709551616.0
	);
	expectDouble(
		"2^64 - 1 rounds to 2^64",
		(f64)u128(0, 0xFFFFFFFFFFFFFFFFULL),
		18446744073709551616.0
	);
	expectDouble(
		"2^128 - 1 rounds to 2^128",
		(f64)u128(0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL),
		18446744073709551616.0 * 18446744073709551616.0
	);
}

static void scenarioSignedValues() {
	expectDouble("INT64_MIN", (f64)i128(INT64_MIN), -9223372036854775808.0);
	expectDouble("LLONG_MIN", (f64)i128(LLONG_MIN), -9223372036854775808.0);
	expectDouble("INT64_MAX rounds to 2^63", (f64)i128(INT64_MAX), 9223372036854775808.0);
	expectDouble("one", (f64)i128(1), 1.0);
	expectDouble("minus one", (f64)i128(-1), -1.0);
	expectDouble(
		"negative 2^64",
		(f64)i128(u128(0xFFFFFFFFFFFFFFFFULL, 0)),
		-18446744073709551616.0
	);
}

int main() {
	scenarioUnsignedHighWord();
	scenarioSignedValues();

	if (failures == 0) {
		printf("int128-f64: all scenarios passed\n");
		return 0;
	}
	printf("int128-f64: %d check(s) failed\n", failures);
	return 1;
}
