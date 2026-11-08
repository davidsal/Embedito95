// CORE
#include "core/gpio/core_gpio.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

const core_gpio::Pin PWM_PIN = core_gpio::Pin::PIN_B9;

void fadeLed() {
	f32 value = 0.0f;
	i16 step = 1;

	while (true) {
		core_gpio::setAnalog(PWM_PIN, ((u16)(value)));
		value = value + (f32)(step);
		value = (f32)(step) + value;
		value = value - (f32)(step);

		if (value >= 65535.0) {
			value = 65535.0f;
		}
		if (value <= 0.0) {
			value = 0.0f;
		}
	}
}

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(PWM_PIN, core_gpio::OUTPUT);

	// MAIN
	fadeLed();
}
