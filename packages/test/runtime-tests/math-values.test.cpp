// Host unit tests for the shared math implementation
// (strategies/shared/math/math_common.cpp). The same source is inlined into
// every platform's core_math.cpp, so compiling it here validates the trig,
// logarithm, remainder and byte/bit helpers before they reach the device.
//
// The checks use a tolerance because the results are f32 and come from libm;
// domain edges (NaN / -inf) follow the C library rules and are asserted as
// such instead of comparing bit patterns.

#include <cmath>
#include <stdint.h>
#include <stdio.h>

#include <core_type.h>

namespace core_math {
#include "packages/registry/src/strategies/shared/math/math_common.cpp"
} // namespace core_math

static const float TOLERANCE = 1e-5f;
static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                      \
			failures++;                                                          \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);          \
		}                                                                        \
	} while (0)

static bool nearlyEqual(float actual, float expected) {
	const float difference = actual - expected;
	const float magnitude = difference < 0.0f ? -difference : difference;
	return magnitude <= TOLERANCE;
}

static void scenarioInverseTrigonometry() {
	CHECK(nearlyEqual(core_math::arcSine(0.5f), 0.5235987756f));
	CHECK(nearlyEqual(core_math::arcCosine(0.5f), 1.0471975512f));
	CHECK(nearlyEqual(core_math::arcTangent(1.0f), 0.7853981634f));
	CHECK(nearlyEqual(core_math::arcTangent2(1.0f, 1.0f), 0.7853981634f));
	CHECK(nearlyEqual(core_math::arcTangent2(1.0f, -1.0f), 2.3561944902f));
	CHECK(nearlyEqual(core_math::arcSine(1.0f), 1.5707963268f));
}

static void scenarioInverseTrigonometryDomain() {
	CHECK(std::isnan(core_math::arcSine(2.0f)));
	CHECK(std::isnan(core_math::arcCosine(-2.0f)));
	CHECK(nearlyEqual(core_math::arcSine(-1.0f), -1.5707963268f));
}

static void scenarioLogarithmsAndExponential() {
	CHECK(nearlyEqual(core_math::naturalLog(2.7182817f), 1.0f));
	CHECK(nearlyEqual(core_math::logarithm10(100.0f), 2.0f));
	CHECK(nearlyEqual(core_math::exponential(0.0f), 1.0f));
	CHECK(nearlyEqual(core_math::exponential(1.0f), 2.7182817f));
}

static void scenarioLogarithmDomain() {
	CHECK(std::isinf(core_math::naturalLog(0.0f)));
	CHECK(core_math::naturalLog(0.0f) < 0.0f);
	CHECK(std::isnan(core_math::naturalLog(-1.0f)));
	CHECK(std::isinf(core_math::logarithm10(0.0f)));
	CHECK(core_math::logarithm10(0.0f) < 0.0f);
	CHECK(std::isnan(core_math::logarithm10(-1.0f)));
}

static void scenarioRemainderAndTruncate() {
	CHECK(nearlyEqual(core_math::remainderFloat(5.5f, 2.0f), 1.5f));
	CHECK(nearlyEqual(core_math::remainderFloat(-5.5f, 2.0f), -1.5f));
	CHECK(nearlyEqual(core_math::remainderFloat(5.5f, -2.0f), 1.5f));
	CHECK(std::isnan(core_math::remainderFloat(1.0f, 0.0f)));
	CHECK(nearlyEqual(core_math::truncate(3.9f), 3.0f));
	CHECK(nearlyEqual(core_math::truncate(-3.9f), -3.0f));
	CHECK(nearlyEqual(core_math::truncate(0.5f), 0.0f));
}

static void scenarioSquare() {
	CHECK(nearlyEqual(core_math::square(4.0f), 16.0f));
	CHECK(nearlyEqual(core_math::square(-3.0f), 9.0f));
	CHECK(nearlyEqual(core_math::square(0.0f), 0.0f));
}

static void scenarioByteHelpers() {
	CHECK(core_math::lowByteValue(0xABCDUL) == 0xCD);
	CHECK(core_math::highByteValue(0xABCDUL) == 0xAB);
	CHECK(core_math::lowByteValue(0x0000FF00UL) == 0x00);
	CHECK(core_math::highByteValue(0x0000FF00UL) == 0xFF);
}

static void scenarioBitMask() {
	CHECK(core_math::bitMask(0) == 0x00000001UL);
	CHECK(core_math::bitMask(7) == 0x00000080UL);
	CHECK(core_math::bitMask(31) == 0x80000000UL);
	CHECK(core_math::bitMask(32) == 0UL);
	CHECK(core_math::bitMask(255) == 0UL);
}

int main() {
	scenarioInverseTrigonometry();
	scenarioInverseTrigonometryDomain();
	scenarioLogarithmsAndExponential();
	scenarioLogarithmDomain();
	scenarioRemainderAndTruncate();
	scenarioSquare();
	scenarioByteHelpers();
	scenarioBitMask();

	if (failures == 0) {
		printf("Math-values: all scenarios passed\n");
		return 0;
	}
	printf("Math-values: %d check(s) failed\n", failures);
	return 1;
}
