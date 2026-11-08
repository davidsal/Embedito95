// CORE
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

const u16 MAX_VALUE = 65535;
const i8 MIN_VALUE = 0;
const u8 STEP_SIZE = 131;

void fade() {
	i32 value = 0;
	i32 step = 131;

	while (true) {
		core_gpio::setAnalog(core_gpio::Pin::PIN_B1, value);
		value = value + step;

		if (value >= (i32)(MAX_VALUE)) {
			value = MAX_VALUE;
			step = -(i32)(STEP_SIZE);
		}
		if (value <= (i32)(MIN_VALUE)) {
			value = MIN_VALUE;
			step = STEP_SIZE;
		}

		core_time::delay(2);
	}
}

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(core_gpio::Pin::PIN_B1, core_gpio::OUTPUT);

	// MAIN
	fade();
}
