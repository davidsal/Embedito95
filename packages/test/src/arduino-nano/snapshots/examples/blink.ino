// CORE
#include <core_gpio.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>

const i16 BLINK_INTERVAL = 1000;

void blink() {
	while (true) {
		core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::HIGH);
		core_time::delay(BLINK_INTERVAL);
		core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::LOW);
		core_time::delay(BLINK_INTERVAL);
	}
}

void setup() {
	// SETUP
	core_gpio::setMode(core_gpio::LED_BUILTIN, core_gpio::OUTPUT);

	// MAIN
	blink();
}

void loop() {
}
