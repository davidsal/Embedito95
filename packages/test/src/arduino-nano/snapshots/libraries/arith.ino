// CORE
#include <core_gpio.h>
#include <core_system.h>
#include <core_type.h>

const core_gpio::Pin PWM_PIN = core_gpio::Pin::PIN_10;

void fadeLed() {
	f32 value = 0.0f;
	i16 step = 1;

	while (true) {
		core_gpio::setAnalog(PWM_PIN, ((u8)(value)));
		value = value + (f32)(step);
		value = (f32)(step) + value;
		value = value - (f32)(step);

		if (value >= 255.0) {
			value = 255.0f;
		}
		if (value <= 0.0) {
			value = 0.0f;
		}
	}
}

void setup() {
	// SETUP
	core_gpio::setMode(PWM_PIN, core_gpio::OUTPUT);

	// MAIN
	fadeLed();
}

void loop() {
}
