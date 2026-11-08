// CORE
#include <core_gpio.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>

void button() {
	while (true) {
		const core_gpio::DigitalLevel buttonState = core_gpio::getDigital(core_gpio::Pin::PIN_2);

		if (buttonState == core_gpio::LOW) {
			core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::HIGH);
		} else {
			core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::LOW);
		}

		core_time::delay(50);
	}
}

void setup() {
	// SETUP
	core_gpio::setMode(core_gpio::Pin::PIN_2, core_gpio::INPUT_PULLUP);
	core_gpio::setMode(core_gpio::LED_BUILTIN, core_gpio::OUTPUT);

	// MAIN
	button();
}

void loop() {
}
