#ifndef _E95_INTERRUPT_H
#define _E95_INTERRUPT_H

#include "../gpio/core_gpio.h"
#include "../type/core_type.h"

namespace core_interrupt {

// The public API reports a pin without an external interrupt channel as 255.
const u8 INVALID_PIN = 255;

enum InterruptMode : u8 {
	INTERRUPT_LOW = 0,
	INTERRUPT_CHANGE = 1,
	INTERRUPT_RISING = 2,
	INTERRUPT_FALLING = 3,
};

u8 getInterruptNumber(core_gpio::Pin pin);

void attachPinInterrupt(
	core_gpio::Pin pin,
	void (*handler)(),
	InterruptMode mode);

void detachPinInterrupt(core_gpio::Pin pin);

void enableInterrupts();

void disableInterrupts();

} // namespace core_interrupt

#endif
