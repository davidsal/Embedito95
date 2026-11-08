// CORE
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

void dimmer() {
	while (true) {
		const i32 brightness = (i32)(core_gpio::getAnalog(core_gpio::Pin::PIN_A0)) * (i32)(16);
		core_gpio::setAnalog(core_gpio::Pin::PIN_B1, brightness);
		core_time::delay(50);
	}
}

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(core_gpio::Pin::PIN_A0, core_gpio::INPUT);
	core_gpio::setMode(core_gpio::Pin::PIN_B1, core_gpio::OUTPUT);

	// MAIN
	dimmer();
}
