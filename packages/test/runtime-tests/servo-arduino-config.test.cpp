// Host compile+behaviour guard for the generated AVR servo hardware
// implementation (src/arduino-nano/snapshots/engine/servo_hardware/). The
// generated .cpp is compiled as part of this translation unit against the
// AVR-like register surface in host/avr/io.h, so a strategy regression that
// breaks Timer1 mode 14, the compare mapping or the release path fails here.

#include <stdint.h>
#include <stdio.h>

#include <Arduino.h>
#include <avr/io.h>

volatile uint8_t TCCR1A = 0;
volatile uint8_t TCCR1B = 0;
volatile uint16_t TCNT1 = 0;
volatile uint16_t OCR1A = 0;
volatile uint16_t OCR1B = 0;
volatile uint16_t ICR1 = 0;

static uint8_t pinModes[32] = {0};
static uint8_t pinLevels[32] = {0};

void pinMode(uint8_t pin, uint8_t mode) {
	pinModes[pin] = mode;
}

void digitalWrite(uint8_t pin, uint8_t value) {
	pinLevels[pin] = value;
}

int digitalRead(uint8_t pin) {
	return pinLevels[pin];
}

#include "packages/test/src/arduino-nano/snapshots/engine/servo_hardware/core_servo_hardware.cpp"

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static const u16 FRAME_TOP = 39999;
static const u8 OUTPUT_MODE = 1;
static const u8 LOW_LEVEL = 0;

static void resetRegisters() {
	core_servo_hardware::releaseChannel(1);
	core_servo_hardware::releaseChannel(2);
	TCCR1A = 0;
	TCCR1B = 0;
	TCNT1 = 0;
	OCR1A = 0;
	OCR1B = 0;
	ICR1 = 0;
	pinModes[9] = 0;
	pinModes[10] = 0;
	pinLevels[9] = 1;
	pinLevels[10] = 1;
}

static void scenarioResolvesChannelsFromPins() {
	CHECK(core_servo_hardware::getChannelCount() == 2);
	CHECK(core_servo_hardware::getChannel(core_gpio::PIN_9) == 1);
	CHECK(core_servo_hardware::getChannel(core_gpio::PIN_10) == 2);
	CHECK(core_servo_hardware::getChannel(core_gpio::PIN_5) == 0);
}

static void scenarioConfiguresTimerModeFourteen() {
	resetRegisters();

	core_servo_hardware::setChannelPulse(1, 1500);

	CHECK(TCCR1A == (u8)(_BV(WGM11) | _BV(COM1A1)));
	CHECK(TCCR1B == (u8)(_BV(WGM13) | _BV(WGM12) | _BV(CS11)));
	CHECK(ICR1 == FRAME_TOP);
	CHECK(OCR1A == 3000);
	CHECK(pinModes[9] == OUTPUT_MODE);
}

static void scenarioSecondChannelSharesTheFrame() {
	resetRegisters();

	core_servo_hardware::setChannelPulse(1, 1000);
	core_servo_hardware::setChannelPulse(2, 2000);

	CHECK(OCR1A == 2000);
	CHECK(OCR1B == 4000);
	CHECK((TCCR1A & _BV(COM1B1)) != 0);
	CHECK(pinModes[10] == OUTPUT_MODE);
	CHECK(ICR1 == FRAME_TOP);
}

static void scenarioClampsPulseToFrame() {
	resetRegisters();

	core_servo_hardware::setChannelPulse(1, 20000);

	CHECK(OCR1A == FRAME_TOP);
}

static void scenarioInvalidChannelIsIgnored() {
	resetRegisters();

	core_servo_hardware::setChannelPulse(0, 1500);
	core_servo_hardware::setChannelPulse(3, 1500);

	CHECK(TCCR1A == 0);
	CHECK(TCCR1B == 0);
	CHECK(OCR1A == 0);
	CHECK(OCR1B == 0);
}

static void scenarioReleaseLastChannelStopsTheTimer() {
	resetRegisters();

	core_servo_hardware::setChannelPulse(1, 1500);
	core_servo_hardware::setChannelPulse(2, 1500);
	core_servo_hardware::releaseChannel(1);

	CHECK((TCCR1A & _BV(COM1A1)) == 0);
	CHECK((TCCR1A & _BV(COM1B1)) != 0);
	CHECK(OCR1A == 0);
	CHECK(pinLevels[9] == LOW_LEVEL);
	CHECK(TCCR1B != 0);

	core_servo_hardware::releaseChannel(2);

	CHECK(TCCR1A == 0);
	CHECK(TCCR1B == 0);
	CHECK(OCR1B == 0);
	CHECK(pinLevels[10] == LOW_LEVEL);
}

int main() {
	scenarioResolvesChannelsFromPins();
	scenarioConfiguresTimerModeFourteen();
	scenarioSecondChannelSharesTheFrame();
	scenarioClampsPulseToFrame();
	scenarioInvalidChannelIsIgnored();
	scenarioReleaseLastChannelStopsTheTimer();

	if (failures > 0) {
		printf("servo-arduino-config: %d failure(s)\n", failures);
		return 1;
	}

	printf("servo-arduino-config: all checks passed\n");
	return 0;
}
