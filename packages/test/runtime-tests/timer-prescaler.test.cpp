// Host unit test for the shared timer period/prescaler helper
// (strategies/shared/timer/timer_common.inc). The helper is inlined into the
// AVR timer implementation, so the exact source is compiled here against the
// same clock/limit values the driver passes: it validates the prescaler ladder,
// the tick count and the clamping of periods longer than the counter.

#include <stdint.h>
#include <stdio.h>

namespace core_timer {
#include "packages/registry/src/strategies/shared/timer/timer_common.inc"
} // namespace core_timer

using core_timer::timer_detail::computePrescaler;
using core_timer::timer_detail::PrescalerConfig;
using core_timer::timer_detail::PrescalerLadder;

static const uint32_t AVR_CLOCK_FREQUENCY = 16000000;
static const uint32_t TEST_PRESCALERS[] = {1, 8, 64, 256, 1024};
static const uint8_t TEST_PRESCALER_COUNT = 5;
static const PrescalerLadder TEST_LADDER = {TEST_PRESCALERS, TEST_PRESCALER_COUNT};

static PrescalerConfig computeTestPrescaler(uint32_t periodMicros, uint32_t maximumTicks) {
	return computePrescaler(periodMicros, AVR_CLOCK_FREQUENCY, maximumTicks, TEST_LADDER);
}
static const uint32_t MAXIMUM_TICKS_8_BIT =
	core_timer::timer_detail::MAXIMUM_TICKS_8_BIT;
static const uint32_t MAXIMUM_TICKS_16_BIT =
	core_timer::timer_detail::MAXIMUM_TICKS_16_BIT;

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void scenarioPicksLowestPrescalerForShortPeriod() {
	const PrescalerConfig config =
		computeTestPrescaler(1, MAXIMUM_TICKS_16_BIT);

	CHECK(config.prescaler == 1);
	CHECK(config.ticks == 16);
}

static void scenarioKeepsPrescalerOneForOneMillisecond() {
	const PrescalerConfig config =
		computeTestPrescaler(1000, MAXIMUM_TICKS_16_BIT);

	CHECK(config.prescaler == 1);
	CHECK(config.ticks == 16000);
}

static void scenarioPicksPrescalerEightForFiveMilliseconds() {
	const PrescalerConfig config =
		computeTestPrescaler(5000, MAXIMUM_TICKS_16_BIT);

	CHECK(config.prescaler == 8);
	CHECK(config.ticks == 10000);
}

static void scenarioPicksPrescalerTwoHundredFiftySixForOneSecond() {
	const PrescalerConfig config =
		computeTestPrescaler(1000000, MAXIMUM_TICKS_16_BIT);

	CHECK(config.prescaler == 256);
	CHECK(config.ticks == 62500);
}

static void scenarioReachesFullSixteenBitCount() {
	const PrescalerConfig config =
		computeTestPrescaler(4194304, MAXIMUM_TICKS_16_BIT);

	CHECK(config.prescaler == 1024);
	CHECK(config.ticks == MAXIMUM_TICKS_16_BIT);
}

static void scenarioClampsPeriodLongerThanSixteenBitCounter() {
	const PrescalerConfig config =
		computeTestPrescaler(5000000, MAXIMUM_TICKS_16_BIT);

	CHECK(config.prescaler == 1024);
	CHECK(config.ticks == MAXIMUM_TICKS_16_BIT);
}

static void scenarioPicksHigherPrescalerForEightBitCounter() {
	const PrescalerConfig config =
		computeTestPrescaler(1000, MAXIMUM_TICKS_8_BIT);

	CHECK(config.prescaler == 64);
	CHECK(config.ticks == 250);
}

static void scenarioClampsPeriodLongerThanEightBitCounter() {
	const PrescalerConfig config =
		computeTestPrescaler(1000000, MAXIMUM_TICKS_8_BIT);

	CHECK(config.prescaler == 1024);
	CHECK(config.ticks == MAXIMUM_TICKS_8_BIT);
}

static void scenarioTreatsZeroPeriodAsOneMicrosecond() {
	const PrescalerConfig config =
		computeTestPrescaler(0, MAXIMUM_TICKS_16_BIT);

	CHECK(config.prescaler == 1);
	CHECK(config.ticks == 16);
}

int main() {
	scenarioPicksLowestPrescalerForShortPeriod();
	scenarioKeepsPrescalerOneForOneMillisecond();
	scenarioPicksPrescalerEightForFiveMilliseconds();
	scenarioPicksPrescalerTwoHundredFiftySixForOneSecond();
	scenarioReachesFullSixteenBitCount();
	scenarioClampsPeriodLongerThanSixteenBitCounter();
	scenarioPicksHigherPrescalerForEightBitCounter();
	scenarioClampsPeriodLongerThanEightBitCounter();
	scenarioTreatsZeroPeriodAsOneMicrosecond();

	if (failures == 0) {
		printf("Timer prescaler helper: all scenarios passed\n");
		return 0;
	}
	printf("Timer prescaler helper: %d check(s) failed\n", failures);
	return 1;
}
