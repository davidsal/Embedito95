// CORE
#include <core_gpio.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>

void dimmer() {
	while (true) {
		const i16 sensorValue = core_gpio::getAnalog(core_gpio::Pin::PIN_A0);
		const i16 brightness = sensorValue / (i16)(4);
		core_gpio::setAnalog(core_gpio::Pin::PIN_10, brightness);
		core_time::delay(10);
	}
}

void setup() {
	// SETUP
	core_gpio::setMode(core_gpio::Pin::PIN_A0, core_gpio::INPUT);
	core_gpio::setMode(core_gpio::Pin::PIN_10, core_gpio::OUTPUT);

	// MAIN
	dimmer();
}

void loop() {
}
