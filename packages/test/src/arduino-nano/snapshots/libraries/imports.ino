// CORE
#include <core_gpio.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>

const core_gpio::Pin LED_PIN = core_gpio::Pin::PIN_LED_BUILTIN;
const i16 PERIOD_MS = 1000;

void blink() {
	core_gpio::setMode(LED_PIN, core_gpio::OUTPUT);
	while (true) {
		core_gpio::setDigital(LED_PIN, core_gpio::HIGH);
		core_time::delay(PERIOD_MS);
		core_gpio::setDigital(LED_PIN, core_gpio::LOW);
		core_time::delay(PERIOD_MS);
	}
}

u32 measure() {
	const u32 start = core_time::getMillis();
	const u32 end = core_time::getMillis();
	if (end > start) {
		return end;
	}
	return start;
}

void setup() {
	// SETUP
	blink();

	// MAIN
	measure();
}

void loop() {
}
