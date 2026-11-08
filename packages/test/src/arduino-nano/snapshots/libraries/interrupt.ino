// CORE
#include <core_gpio.h>
#include <core_interrupt.h>
#include <core_system.h>
#include <core_type.h>

const u8 FALLING_CHANNEL = 0;
const u8 RISING_CHANNEL = 1;

void onEdge() {

}

void setup() {
	// SETUP
	core_interrupt::attachPinInterrupt(core_gpio::Pin::PIN_2, onEdge, core_interrupt::InterruptMode::INTERRUPT_FALLING);
	core_interrupt::attachPinInterrupt(core_gpio::Pin::PIN_3, onEdge, core_interrupt::InterruptMode::INTERRUPT_RISING);
	core_interrupt::enableInterrupts();

	// MAIN
	const u8 fallingChannel = core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_2);
	const u8 risingChannel = core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_3);
	if ((fallingChannel != FALLING_CHANNEL || risingChannel != RISING_CHANNEL)) {
		core_interrupt::disableInterrupts();
	}
	core_interrupt::detachPinInterrupt(core_gpio::Pin::PIN_2);
	core_interrupt::detachPinInterrupt(core_gpio::Pin::PIN_3);
	core_interrupt::disableInterrupts();
}

void loop() {
}
