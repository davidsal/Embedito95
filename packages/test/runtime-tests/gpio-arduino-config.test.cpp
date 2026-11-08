// Host compile+behaviour guard for the real arduino gpio header
// (strategies/arduino/gpio/gpio.h). The header is included verbatim against the
// AVR-like analog surface in host/Arduino.h, so a regression that emits an
// invented register/bit (`ADMUX`/`REFS0`/`REFS1`) or the wrong voltage-reference
// encoding fails here, exactly where the device would. The pin table and the
// pin-mode members are supplied through the same substitution markers the
// installer fills when it generates `core_gpio.h`.

#include <stdint.h>
#include <stdio.h>

volatile uint8_t ADMUX = 0;

static int lastAnalogWritePin = -1;
static int lastAnalogWriteValue = -1;

void pinMode(uint8_t pin, uint8_t mode) {
	(void)pin;
	(void)mode;
}

void digitalWrite(uint8_t pin, uint8_t val) {
	(void)pin;
	(void)val;
}

int digitalRead(uint8_t pin) {
	(void)pin;
	return 0;
}

int analogRead(uint8_t pin) {
	(void)pin;
	return 0;
}

void analogWrite(uint8_t pin, int val) {
	lastAnalogWritePin = pin;
	lastAnalogWriteValue = val;
}

#define _e95_replace_pinUndefs
#define _e95_replace_pinModeMembers \
	INPUT = 0, OUTPUT = 1, INPUT_PULLUP = 2,
#define _e95_replace_pinsTable  \
	typedef enum : u8 {         \
		PIN_9 = 9,              \
		PIN_LED_BUILTIN = 13,   \
		PIN_A0 = A0,            \
		PIN_A1 = A1,            \
		PIN_A2 = A2,            \
		PIN_A3 = A3,            \
		PIN_A4 = A4,            \
		PIN_A5 = A5,            \
		PIN_A6 = A6,            \
		PIN_A7 = A7             \
	} Pin;
#include "packages/registry/src/strategies/arduino/gpio/gpio.h"

static const uint8_t REFERENCE_BITS = 0xC0;
static const uint8_t EXTERNAL_REFERENCE_BITS = 0x00;
static const uint8_t SUPPLY_REFERENCE_BITS = 0x40;
static const uint8_t INTERNAL_REFERENCE_BITS = 0xC0;
static const uint8_t CHANNEL_BITS = 0x07;
static const uint8_t PWM_PIN_NUMBER = 9;
static const int PWM_DUTY_VALUE = 128;

static int failures = 0;

#define CHECK(condition)                                              \
	do {                                                              \
		if (!(condition)) {                                          \
			failures++;                                              \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
		}                                                            \
	} while (0)

static void scenarioSelectsSupplyReference() {
	ADMUX = CHANNEL_BITS;

	core_gpio::setReference(core_gpio::SUPPLY);

	CHECK((ADMUX & REFERENCE_BITS) == SUPPLY_REFERENCE_BITS);
	CHECK((ADMUX & CHANNEL_BITS) == CHANNEL_BITS);
}

static void scenarioSelectsInternalReference() {
	ADMUX = EXTERNAL_REFERENCE_BITS;

	core_gpio::setReference(core_gpio::INTERNAL);

	CHECK((ADMUX & REFERENCE_BITS) == INTERNAL_REFERENCE_BITS);
}

static void scenarioSelectsExternalReference() {
	ADMUX = REFERENCE_BITS;

	core_gpio::setReference(core_gpio::EXTERNAL);

	CHECK((ADMUX & REFERENCE_BITS) == EXTERNAL_REFERENCE_BITS);
}

static void scenarioSetAnalogWritesThrough() {
	core_gpio::setAnalog(core_gpio::PIN_9, PWM_DUTY_VALUE);

	CHECK(lastAnalogWritePin == PWM_PIN_NUMBER);
	CHECK(lastAnalogWriteValue == PWM_DUTY_VALUE);
}

int main() {
	scenarioSelectsSupplyReference();
	scenarioSelectsInternalReference();
	scenarioSelectsExternalReference();
	scenarioSetAnalogWritesThrough();

	if (failures == 0) {
		printf("GPIO arduino analog config: all scenarios passed\n");
		return 0;
	}
	printf("GPIO arduino analog config: %d check(s) failed\n", failures);
	return 1;
}
