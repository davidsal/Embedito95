// CORE
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

void button() {
	while (true) {
		const core_gpio::DigitalLevel buttonState = core_gpio::getDigital(core_gpio::Pin::PIN_A8);

		if (buttonState == core_gpio::LOW) {
			core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::LOW);
		} else {
			core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::HIGH);
		}

		core_time::delay(50);
	}
}

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(core_gpio::Pin::PIN_A8, core_gpio::INPUT_PULLUP);
	core_gpio::setMode(core_gpio::LED_BUILTIN, core_gpio::OUTPUT);

	// MAIN
	button();
}
