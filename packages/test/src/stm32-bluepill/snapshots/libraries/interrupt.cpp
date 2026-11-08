// CORE
#include "core/gpio/core_gpio.h"
#include "core/interrupt/core_interrupt.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

void onEdge() {

}

int main() {
	// SETUP
	initializeSystemClock();
	core_interrupt::attachPinInterrupt(core_gpio::Pin::PIN_B6, onEdge, core_interrupt::InterruptMode::INTERRUPT_FALLING);
	core_interrupt::enableInterrupts();

	// MAIN
	const u8 channel = core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_B6);
	core_interrupt::detachPinInterrupt(core_gpio::Pin::PIN_B6);
	core_interrupt::disableInterrupts();
}
