// Host compile+behaviour guard for the *generated* arduino timer header
// (src/arduino-nano/snapshots/engine/timer/core_timer.h). It is included
// verbatim against the AVR-like surface in host/avr/io.h, so a strategy
// regression that breaks the emitted ordering (e.g. functions before the
// support block's `Timer` enum) fails here, exactly where the device would.

#include <stdint.h>
#include <stdio.h>

#include <Arduino.h>
#include <avr/io.h>

volatile uint8_t ADMUX = 0;

static uint8_t pinLevels[32] = {0};

static const u16 TONE_FREQUENCY_HERTZ = 440;
static const u8 TONE_HALF_PERIOD_TICKS = 71;
static const u32 PULSE_TIMEOUT_MICROS = 1000;
static const u32 SHORT_PULSE_TIMEOUT_MICROS = 5;
static const u32 EXPECTED_PULSE_WIDTH_MICROS = 2;
static const u8 PULSE_PIN = 3;
static const uint8_t PULSE_READ_SEQUENCE[] = {1, 0, 1, 1, 0};
static const uint8_t LONG_PULSE_READ_SEQUENCE[] = {
	0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
};

static const uint8_t *activePulseSequence = PULSE_READ_SEQUENCE;
static uint8_t activePulseSequenceCount =
	sizeof(PULSE_READ_SEQUENCE) / sizeof(PULSE_READ_SEQUENCE[0]);
static uint8_t pulseReadIndex = 0;

void pinMode(uint8_t pin, uint8_t mode) {
	(void)pin;
	(void)mode;
}

void digitalWrite(uint8_t pin, uint8_t value) {
	pinLevels[pin] = value;
}

int digitalRead(uint8_t pin) {
	if (pin == PULSE_PIN && pulseReadIndex < activePulseSequenceCount) {
		return activePulseSequence[pulseReadIndex++];
	}
	return pinLevels[pin];
}

static uint32_t fakeMicroseconds = 0;

namespace core_time {

uint32_t getMicros() {
	return fakeMicroseconds++;
}

} // namespace core_time

static void selectPulseSequence(const uint8_t *sequence, uint8_t count) {
	activePulseSequence = sequence;
	activePulseSequenceCount = count;
	pulseReadIndex = 0;
}

static void resetPulseSequence() {
	selectPulseSequence(
		PULSE_READ_SEQUENCE,
		sizeof(PULSE_READ_SEQUENCE) / sizeof(PULSE_READ_SEQUENCE[0]));
}

volatile uint8_t TCCR0A = 0;
volatile uint8_t TCCR0B = 0;
volatile uint8_t TCNT0 = 0;
volatile uint8_t OCR0A = 0;
volatile uint8_t TIMSK0 = 0;
volatile uint8_t TIFR0 = 0;

volatile uint8_t TCCR1A = 0;
volatile uint8_t TCCR1B = 0;
volatile uint16_t TCNT1 = 0;
volatile uint16_t OCR1A = 0;
volatile uint8_t TIMSK1 = 0;
volatile uint8_t TIFR1 = 0;

volatile uint8_t TCCR2A = 0;
volatile uint8_t TCCR2B = 0;
volatile uint8_t TCNT2 = 0;
volatile uint8_t OCR2A = 0;
volatile uint8_t TIMSK2 = 0;
volatile uint8_t TIFR2 = 0;

#include "packages/test/src/arduino-nano/snapshots/engine/timer/core_timer.h"

extern "C" void e95_timer1_compare_a_interrupt(void);
extern "C" void e95_timer2_compare_a_interrupt(void);

static int tickCount = 0;

static void onTick() {
	tickCount++;
}

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void resetRegisters() {
	TCCR1A = 0;
	TCCR1B = 0;
	TCNT1 = 0;
	OCR1A = 0;
	TIMSK1 = 0;
	TIFR1 = 0;
	TCCR2A = 0;
	TCCR2B = 0;
	TCNT2 = 0;
	OCR2A = 0;
	TIMSK2 = 0;
	TIFR2 = 0;
	core_timer::timer_detail::setCallback(core_timer::Timer::TIMER_1, nullptr);
	core_timer::timer_detail::setCallback(core_timer::Timer::TIMER_2, nullptr);
	core_timer::timer_detail::clearTonePin(core_timer::Timer::TIMER_1);
	core_timer::timer_detail::clearTonePin(core_timer::Timer::TIMER_2);
	pinLevels[2] = 0;
	pinLevels[3] = 0;
	pinLevels[9] = 0;
	resetPulseSequence();
}

static void scenarioConfiguresSixteenBitPeriod() {
	resetRegisters();
	const core_timer::HardwareTimer timer =
		core_timer::getTimer(core_timer::Timer::TIMER_1);

	timer.setPeriod(1000);

	CHECK(TCCR1A == 0);
	CHECK(TCCR1B == (u8)(_BV(WGM12) | _BV(CS10)));
	CHECK(TCNT1 == 0);
	CHECK(OCR1A == 15999);
}

static void scenarioConfiguresEightBitPeriod() {
	resetRegisters();
	const core_timer::HardwareTimer timer =
		core_timer::getTimer(core_timer::Timer::TIMER_2);

	timer.setPeriod(1000);

	CHECK(TCCR2A == (u8)_BV(WGM21));
	CHECK(TCCR2B == (u8)(_BV(CS10) | _BV(CS11)));
	CHECK(TCNT2 == 0);
	CHECK(OCR2A == 249);
}

static void scenarioInitializeStoresCallbackAndDisablesInterrupts() {
	resetRegisters();
	const core_timer::HardwareTimer timer =
		core_timer::getTimer(core_timer::Timer::TIMER_1);

	timer.initialize(1000, onTick);

	CHECK((TIMSK1 & _BV(OCIE1A)) == 0);
	CHECK((TCCR1B & _BV(CS10)) != 0);
	CHECK(OCR1A == 15999);

	timer.start();
	CHECK((TIMSK1 & _BV(OCIE1A)) != 0);
	CHECK((TIFR1 & _BV(OCF1A)) != 0);

	tickCount = 0;
	e95_timer1_compare_a_interrupt();
	CHECK(tickCount == 1);

	TCNT1 = 123;
	timer.stop();
	CHECK((TIMSK1 & _BV(OCIE1A)) == 0);
	CHECK((TCCR1B & _BV(CS10)) != 0);
	CHECK(TCNT1 == 123);
	e95_timer1_compare_a_interrupt();
	CHECK(tickCount == 2);
}

static void scenarioChangingPeriodKeepsInterruptMask() {
	resetRegisters();
	const core_timer::HardwareTimer timer =
		core_timer::getTimer(core_timer::Timer::TIMER_1);

	timer.initialize(1000, onTick);
	timer.start();
	timer.setPeriod(2000);

	CHECK((TIMSK1 & _BV(OCIE1A)) != 0);
	CHECK(OCR1A == 31999);
}

static void scenarioEightBitInterruptUsesItsOwnMask() {
	resetRegisters();
	const core_timer::HardwareTimer timer =
		core_timer::getTimer(core_timer::Timer::TIMER_2);

	timer.initialize(1000, onTick);
	CHECK((TIMSK2 & _BV(OCIE2A)) == 0);

	timer.start();
	CHECK((TIMSK2 & _BV(OCIE2A)) != 0);
	CHECK((TIMSK1 & _BV(OCIE1A)) == 0);

	tickCount = 0;
	e95_timer2_compare_a_interrupt();
	CHECK(tickCount == 1);
}

static void scenarioDefaultHandleIgnoresOperations() {
	resetRegisters();
	const core_timer::HardwareTimer timer;

	timer.initialize(1000, onTick);
	timer.setPeriod(2000);
	timer.start();
	timer.stop();

	CHECK(OCR1A == 0);
	CHECK(TIMSK1 == 0);
	CHECK(TIMSK2 == 0);
}

static void scenarioComparesTimerHandles() {
	const core_timer::HardwareTimer first =
		core_timer::getTimer(core_timer::Timer::TIMER_1);
	const core_timer::HardwareTimer second =
		core_timer::getTimer(core_timer::Timer::TIMER_2);

	CHECK(first == core_timer::getTimer(core_timer::Timer::TIMER_1));
	CHECK(first != second);
}

static void scenarioStartToneUsesHalfPeriodAndTogglesPin() {
	resetRegisters();

	core_timer::startTone(
		core_timer::Timer::TIMER_2,
		core_gpio::PIN_2,
		TONE_FREQUENCY_HERTZ);

	CHECK((TIMSK2 & _BV(OCIE2A)) != 0);
	CHECK(TCCR2B == (u8)_BV(CS12));
	CHECK(OCR2A == TONE_HALF_PERIOD_TICKS - 1);
	CHECK(pinLevels[2] == (u8)core_gpio::LOW);

	e95_timer2_compare_a_interrupt();
	CHECK(pinLevels[2] == (u8)core_gpio::HIGH);

	e95_timer2_compare_a_interrupt();
	CHECK(pinLevels[2] == (u8)core_gpio::LOW);

	core_timer::stopTone(core_gpio::PIN_2);
	CHECK((TIMSK2 & _BV(OCIE2A)) == 0);
	CHECK(pinLevels[2] == (u8)core_gpio::LOW);
}

static void scenarioToneTakesOverTheTimerCallback() {
	resetRegisters();
	const core_timer::HardwareTimer timer =
		core_timer::getTimer(core_timer::Timer::TIMER_2);

	timer.initialize(1000, onTick);
	timer.start();
	core_timer::startTone(
		core_timer::Timer::TIMER_2,
		core_gpio::PIN_2,
		TONE_FREQUENCY_HERTZ);

	tickCount = 0;
	e95_timer2_compare_a_interrupt();
	CHECK(tickCount == 0);
	CHECK(pinLevels[2] == (u8)core_gpio::HIGH);
}

static void scenarioMeasurePulseWidthReadsTheHighTime() {
	resetRegisters();
	fakeMicroseconds = 100;

	const u32 width = core_timer::measurePulseWidth(
		core_gpio::PIN_3,
		core_gpio::HIGH,
		PULSE_TIMEOUT_MICROS);

	CHECK(width == EXPECTED_PULSE_WIDTH_MICROS);
}

static void scenarioMeasurePulseWidthReturnsZeroOnTimeout() {
	resetRegisters();
	fakeMicroseconds = 0;
	pulseReadIndex = activePulseSequenceCount;
	pinLevels[3] = (u8)core_gpio::HIGH;

	const u32 width = core_timer::measurePulseWidth(
		core_gpio::PIN_3,
		core_gpio::HIGH,
		SHORT_PULSE_TIMEOUT_MICROS);

	CHECK(width == 0);
}

static void scenarioMeasurePulseWidthBlocksAboutTwiceTheTimeout() {
	resetRegisters();
	fakeMicroseconds = 0;
	selectPulseSequence(
		LONG_PULSE_READ_SEQUENCE,
		sizeof(LONG_PULSE_READ_SEQUENCE) / sizeof(LONG_PULSE_READ_SEQUENCE[0]));

	const u32 width = core_timer::measurePulseWidth(
		core_gpio::PIN_3,
		core_gpio::HIGH,
		SHORT_PULSE_TIMEOUT_MICROS);

	// The pulse starts after nearly one timeout and then outlasts another one,
	// so the two sequential waits block for roughly twice the timeout.
	CHECK(width == 0);
	CHECK(fakeMicroseconds >= 2 * SHORT_PULSE_TIMEOUT_MICROS);
}

int main() {
	scenarioConfiguresSixteenBitPeriod();
	scenarioConfiguresEightBitPeriod();
	scenarioInitializeStoresCallbackAndDisablesInterrupts();
	scenarioChangingPeriodKeepsInterruptMask();
	scenarioEightBitInterruptUsesItsOwnMask();
	scenarioDefaultHandleIgnoresOperations();
	scenarioComparesTimerHandles();
	scenarioStartToneUsesHalfPeriodAndTogglesPin();
	scenarioToneTakesOverTheTimerCallback();
	scenarioMeasurePulseWidthReadsTheHighTime();
	scenarioMeasurePulseWidthReturnsZeroOnTimeout();
	scenarioMeasurePulseWidthBlocksAboutTwiceTheTimeout();

	if (failures == 0) {
		printf("Timer arduino config: all scenarios passed\n");
		return 0;
	}
	printf("Timer arduino config: %d check(s) failed\n", failures);
	return 1;
}
