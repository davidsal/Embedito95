// Host unit tests for the software-f64 branch of the shared math
// implementation (strategies/shared/math/math_common.cpp). The AVR targets set
// `E95_FLOAT64_SOFTWARE` and use `_e95_f64`, but the on-device build only
// compiles that branch on the device. This test defines the switch on the host
// so the binary64 paths run against libm-independent expectations.
//
// Algebraic and rounding forms must be exact in binary64; the transcendentals
// deliberately keep f32 precision on these targets, so their result is the f32
// value widened to f64.

#define E95_FLOAT64_SOFTWARE 1

#include <cmath>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <core_f64.h>

#include "packages/registry/src/strategies/shared/f64/f64.cpp"

using u8 = uint8_t;
using i32 = int32_t;
using i64 = int64_t;
using u32 = uint32_t;
using u64 = uint64_t;
using f32 = float;
using f64 = _e95_f64;
using boolean = bool;

namespace core_math {
#include "packages/registry/src/strategies/shared/math/math_common.cpp"
} // namespace core_math

static const double PI = 3.14159265358979323846;
static const uint64_t MAXIMUM_ULP_DISTANCE = 1;
// Far below f32 precision (1e-7) and far above binary64 rounding (1e-16), so a
// result that had been narrowed to f32 would miss it.
static const double RELATIVE_TOLERANCE = 1e-12;

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
	memcpy(&bits, &value, sizeof(bits));
	return bits;
}

static bool sameValue(f64 actual, double expected) {
	return actual.bits == bitsOfDouble(expected);
}

static double toDouble(f64 value) {
	double result = 0.0;
	memcpy(&result, &value.bits, sizeof(result));
	return result;
}

static bool nearlyEqual(f64 actual, double expected) {
	const double widened = toDouble(actual);
	const double difference =
		widened > expected ? widened - expected : expected - widened;
	const double magnitude = expected < 0.0 ? -expected : expected;
	return difference <= magnitude * RELATIVE_TOLERANCE;
}

static bool withinUlps(f64 actual, double expected) {
	const uint64_t expectedBits = bitsOfDouble(expected);
	const uint64_t distance =
		actual.bits > expectedBits ? actual.bits - expectedBits
					   : expectedBits - actual.bits;
	return distance <= MAXIMUM_ULP_DISTANCE;
}

static void scenarioBinary64Precision() {
	const double precise = 3.14159265358979;
	const double single = (double)(float)precise;
	CHECK(sameValue(f64(precise), precise));
	CHECK(!sameValue(f64(precise), single));
	CHECK(withinUlps(core_math::square(f64(precise)), precise * precise));
	CHECK(!withinUlps(core_math::square(f64(precise)), single * single));
	CHECK(withinUlps(core_math::squareRoot(f64(precise)), std::sqrt(precise)));
	CHECK(withinUlps(core_math::squareRoot(f64(2.0)), std::sqrt(2.0)));
	CHECK(nearlyEqual(core_math::squareRoot(f64(1e-300)), std::sqrt(1e-300)));
	CHECK(nearlyEqual(core_math::squareRoot(f64(1e300)), std::sqrt(1e300)));
	CHECK(nearlyEqual(core_math::squareRoot(f64(1e-320)), std::sqrt(1e-320)));
}

static void scenarioExactAlgebra() {
	CHECK(sameValue(core_math::square(f64(1.5)), 2.25));
	CHECK(sameValue(core_math::absoluteFloat(f64(-2.5)), 2.5));
	CHECK(sameValue(core_math::minimumFloat(f64(2.5), f64(1.5)), 1.5));
	CHECK(sameValue(core_math::maximumFloat(f64(2.5), f64(1.5)), 2.5));
	CHECK(sameValue(core_math::clampFloat(f64(-1.5), f64(0.0), f64(1.0)), 0.0));
	CHECK(sameValue(core_math::clampFloat(f64(2.5), f64(0.0), f64(1.0)), 1.0));
	CHECK(sameValue(
		core_math::interpolateRangeFloat(
			f64(5.0), f64(0.0), f64(10.0), f64(0.0), f64(100.0)),
		50.0));
	CHECK(sameValue(core_math::truncate(f64(3.9)), 3.0));
	CHECK(sameValue(core_math::truncate(f64(-3.9)), -3.0));
	CHECK(sameValue(core_math::truncate(f64(0.5)), 0.0));
	CHECK(sameValue(core_math::roundDown(f64(-3.1)), -4.0));
	CHECK(sameValue(core_math::roundUp(f64(-3.9)), -3.0));
	CHECK(sameValue(core_math::roundNearest(f64(2.5)), 3.0));
	CHECK(sameValue(core_math::roundNearest(f64(-2.5)), -3.0));
	CHECK(sameValue(core_math::remainderFloat(f64(5.5), f64(2.0)), 1.5));
	CHECK(sameValue(core_math::remainderFloat(f64(-5.5), f64(2.0)), -1.5));
	CHECK(withinUlps(core_math::toRadians(f64(180.0)), PI));
	CHECK(withinUlps(core_math::toDegrees(f64(PI)), 180.0));
}

static void scenarioSquareRootDomain() {
	CHECK(sameValue(core_math::squareRoot(f64(0.0)), 0.0));
	CHECK(sameValue(core_math::squareRoot(f64(16.0)), 4.0));
	CHECK(std::isinf(static_cast<float>(core_math::squareRoot(f64(
		HUGE_VAL)))));
	CHECK(std::isnan(static_cast<float>(core_math::squareRoot(f64(-1.0)))));
}

static void scenarioTranscendentalsUseFloat32() {
	const double widened = (double)std::sin(0.5f);
	CHECK(sameValue(core_math::sine(f64(0.5)), widened));
	CHECK(sameValue(core_math::cosine(f64(0.5)), (double)std::cos(0.5f)));
	CHECK(sameValue(
		core_math::naturalLog(f64(2.0)), (double)std::log(2.0f)));
	CHECK(sameValue(
		core_math::logarithm10(f64(100.0)), (double)std::log10(100.0f)));
	CHECK(sameValue(
		core_math::exponential(f64(1.0)), (double)std::exp(1.0f)));
	CHECK(sameValue(
		core_math::arcTangent2(f64(1.0), f64(1.0)),
		(double)std::atan2(1.0f, 1.0f)));
}

static void scenarioFloat32OverloadsUnchanged() {
	CHECK(core_math::square(4.0f) == 16.0f);
	CHECK(std::fabs(core_math::squareRoot(16.0f) - 4.0f) <= 1e-5f);
	CHECK(std::fabs(core_math::toRadians(180.0f) - 3.14159265f) <= 1e-5f);
}

int main() {
	scenarioBinary64Precision();
	scenarioExactAlgebra();
	scenarioSquareRootDomain();
	scenarioTranscendentalsUseFloat32();
	scenarioFloat32OverloadsUnchanged();

	if (failures == 0) {
		printf("Math-f64-software: all scenarios passed\n");
		return 0;
	}
	printf("Math-f64-software: %d check(s) failed\n", failures);
	return 1;
}
