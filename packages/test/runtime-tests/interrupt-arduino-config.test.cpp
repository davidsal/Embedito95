// Host compile+behaviour guard for the *generated* arduino interrupt header
// (src/arduino-nano/snapshots/engine/interrupt/core_interrupt.h). The stubs
// mirror the AVR external-interrupt surface so the header is checked against
// the same calls the device receives, without an ISR or heap.

#include <stdint.h>
#include <stdio.h>

#include <Arduino.h>

static const int NOT_AN_INTERRUPT = -1;

void attachInterrupt(
	uint8_t interruptNumber,
	void (*handler)(),
	int mode);
void detachInterrupt(uint8_t interruptNumber);
void interrupts();
void noInterrupts();
int digitalPinToInterrupt(uint8_t pin);

#include "packages/test/src/arduino-nano/snapshots/engine/interrupt/core_interrupt.h"

static const uint8_t INTERRUPT_PIN_CHANNEL_ZERO = 2;
static const uint8_t INTERRUPT_PIN_CHANNEL_ONE = 3;
static const uint8_t CHANNEL_ZERO = 0;
static const uint8_t CHANNEL_ONE = 1;

static uint8_t attachedInterruptNumber = 0;
static uint8_t attachedMode = 0;
static void (*attachedHandler)() = nullptr;
static uint8_t detachCount = 0;
static uint8_t interruptEnableCount = 0;
static uint8_t interruptDisableCount = 0;

void attachInterrupt(
	uint8_t interruptNumber,
	void (*handler)(),
	int mode) {
	attachedInterruptNumber = interruptNumber;
	attachedHandler = handler;
	attachedMode = (uint8_t)mode;
}

void detachInterrupt(uint8_t interruptNumber) {
	(void)interruptNumber;
	detachCount++;
}

void interrupts() {
	interruptEnableCount++;
}

void noInterrupts() {
	interruptDisableCount++;
}

int digitalPinToInterrupt(uint8_t pin) {
	if (pin == INTERRUPT_PIN_CHANNEL_ZERO) {
		return 0;
	}
	if (pin == INTERRUPT_PIN_CHANNEL_ONE) {
		return 1;
	}
	return NOT_AN_INTERRUPT;
}

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void resetInterruptState() {
	attachedInterruptNumber = 0;
	attachedMode = 0;
	attachedHandler = nullptr;
	detachCount = 0;
	interruptEnableCount = 0;
	interruptDisableCount = 0;
}

static void edgeHandler() {}

static void scenarioReportsInterruptChannels() {
	resetInterruptState();

	CHECK(
		core_interrupt::getInterruptNumber(core_gpio::PIN_2) == CHANNEL_ZERO);
	CHECK(
		core_interrupt::getInterruptNumber(core_gpio::PIN_3) == CHANNEL_ONE);
	CHECK(
		core_interrupt::getInterruptNumber(core_gpio::PIN_4) ==
		core_interrupt::INVALID_PIN);
}

static void scenarioAttachesNativeInterrupt() {
	resetInterruptState();

	core_interrupt::attachPinInterrupt(
		core_gpio::PIN_2,
		edgeHandler,
		core_interrupt::InterruptMode::INTERRUPT_RISING);

	CHECK(attachedInterruptNumber == CHANNEL_ZERO);
	CHECK(attachedHandler == edgeHandler);
	CHECK(attachedMode == core_interrupt::TRIGGER_RISING);
}

static void scenarioAttachesFallingMode() {
	resetInterruptState();

	core_interrupt::attachPinInterrupt(
		core_gpio::PIN_3,
		edgeHandler,
		core_interrupt::InterruptMode::INTERRUPT_FALLING);

	CHECK(attachedInterruptNumber == CHANNEL_ONE);
	CHECK(attachedMode == core_interrupt::TRIGGER_FALLING);
}

static void scenarioIgnoresPinWithoutChannel() {
	resetInterruptState();

	core_interrupt::attachPinInterrupt(
		core_gpio::PIN_4,
		edgeHandler,
		core_interrupt::InterruptMode::INTERRUPT_CHANGE);
	core_interrupt::detachPinInterrupt(core_gpio::PIN_4);

	CHECK(attachedHandler == nullptr);
	CHECK(detachCount == 0);
}

static void scenarioDetachesInterrupt() {
	resetInterruptState();

	core_interrupt::detachPinInterrupt(core_gpio::PIN_2);

	CHECK(detachCount == 1);
}

static void scenarioEnablesAndDisablesInterrupts() {
	resetInterruptState();

	core_interrupt::enableInterrupts();
	core_interrupt::disableInterrupts();

	CHECK(interruptEnableCount == 1);
	CHECK(interruptDisableCount == 1);
}

int main() {
	scenarioReportsInterruptChannels();
	scenarioAttachesNativeInterrupt();
	scenarioAttachesFallingMode();
	scenarioIgnoresPinWithoutChannel();
	scenarioDetachesInterrupt();
	scenarioEnablesAndDisablesInterrupts();

	if (failures == 0) {
		printf("PASS interrupt-arduino-config\n");
	}
	return failures == 0 ? 0 : 1;
}
