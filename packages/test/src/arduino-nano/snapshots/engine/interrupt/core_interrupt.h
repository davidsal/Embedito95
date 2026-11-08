#ifndef _E95_INTERRUPT_H
#define _E95_INTERRUPT_H

#include <Arduino.h>
#include <core_gpio.h>
#include <core_type.h>

namespace core_interrupt {

// `digitalPinToInterrupt` reports a pin without an external interrupt channel
// as `NOT_AN_INTERRUPT` (-1); the public API exposes that case as `255`.
const u8 INVALID_PIN = 255;

// Mode values understood by the AVR external-interrupt controller.
const u8 TRIGGER_LOW = 0x00;
const u8 TRIGGER_CHANGE = 0x01;
const u8 TRIGGER_FALLING = 0x02;
const u8 TRIGGER_RISING = 0x03;

enum InterruptMode : u8 {
	INTERRUPT_LOW = TRIGGER_LOW,
	INTERRUPT_CHANGE = TRIGGER_CHANGE,
	INTERRUPT_RISING = TRIGGER_RISING,
	INTERRUPT_FALLING = TRIGGER_FALLING,
};

inline int resolveInterruptNumber(core_gpio::Pin pin) {
	return digitalPinToInterrupt((u8)pin);
}

inline u8 getInterruptNumber(core_gpio::Pin pin) {
	const int interruptNumber = resolveInterruptNumber(pin);
	if (interruptNumber == NOT_AN_INTERRUPT) {
		return INVALID_PIN;
	}
	return (u8)interruptNumber;
}

inline void attachPinInterrupt(
	core_gpio::Pin pin,
	void (*handler)(),
	InterruptMode mode) {
	const int interruptNumber = resolveInterruptNumber(pin);
	if (interruptNumber == NOT_AN_INTERRUPT) {
		return;
	}
	attachInterrupt((u8)interruptNumber, handler, (u8)mode);
}

inline void detachPinInterrupt(core_gpio::Pin pin) {
	const int interruptNumber = resolveInterruptNumber(pin);
	if (interruptNumber == NOT_AN_INTERRUPT) {
		return;
	}
	detachInterrupt((u8)interruptNumber);
}

inline void enableInterrupts() {
	interrupts();
}

inline void disableInterrupts() {
	noInterrupts();
}

} // namespace core_interrupt

#endif
