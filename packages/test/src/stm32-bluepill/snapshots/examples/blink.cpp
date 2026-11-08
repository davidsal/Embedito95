// CORE
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

const i16 BLINK_INTERVAL = 1000;

void blink() {
	while (true) {
		core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::HIGH);
		core_time::delay(BLINK_INTERVAL);
		core_gpio::setDigital(core_gpio::LED_BUILTIN, core_gpio::LOW);
		core_time::delay(BLINK_INTERVAL);
	}
}

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(core_gpio::LED_BUILTIN, core_gpio::OUTPUT);

	// MAIN
	blink();
}
