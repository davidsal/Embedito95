// CORE
#include <core_gpio.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>

const u8 MAX_VALUE = 255;
const i8 MIN_VALUE = 0;
const i8 STEP_SIZE = 1;

void fade() {
	i16 value = 0;
	i16 step = 1;

	while (true) {
		core_gpio::setAnalog(core_gpio::Pin::PIN_10, value);
		value = value + step;

		if (value >= (i16)(MAX_VALUE)) {
			value = MAX_VALUE;
			step = -STEP_SIZE;
		}
		if (value <= (i16)(MIN_VALUE)) {
			value = MIN_VALUE;
			step = STEP_SIZE;
		}

		core_time::delay(4);
	}
}

void setup() {
	// SETUP
	core_gpio::setMode(core_gpio::Pin::PIN_10, core_gpio::OUTPUT);

	// MAIN
	fade();
}

void loop() {
}
