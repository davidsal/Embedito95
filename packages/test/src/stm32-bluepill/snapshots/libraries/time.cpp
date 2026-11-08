// CORE
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

const core_gpio::Pin LED_PIN = core_gpio::Pin::PIN_LED_BUILTIN;
const i16 PERIOD_MS = 1000;
const i16 PERIOD_US = 1000;

void blinkMs() {
	while (true) {
		core_gpio::setDigital(LED_PIN, core_gpio::HIGH);
		core_time::delay(PERIOD_MS);
		core_gpio::setDigital(LED_PIN, core_gpio::LOW);
		core_time::delay(PERIOD_MS);
	}
}

void blinkMicros() {
	while (true) {
		core_gpio::setDigital(LED_PIN, core_gpio::HIGH);
		core_time::delayMicros(PERIOD_US);
		core_gpio::setDigital(LED_PIN, core_gpio::LOW);
		core_time::delayMicros(PERIOD_US);
	}
}

void blinkElapsed() {
	const u32 startMillis = core_time::getMillis();
	const u32 startMicros = core_time::getMicros();
	while (true) {
		const i64 elapsedMillis = (i64)(core_time::getMillis()) - (i64)(startMillis);
		if (elapsedMillis >= (i64)(PERIOD_MS)) {
			core_gpio::setDigital(LED_PIN, core_gpio::HIGH);
		}
		const i64 elapsedMicros = (i64)(core_time::getMicros()) - (i64)(startMicros);
		if (elapsedMicros >= (i64)(PERIOD_US)) {
			core_gpio::setDigital(LED_PIN, core_gpio::LOW);
		}
	}
}

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(LED_PIN, core_gpio::OUTPUT);

	// MAIN
	blinkMs();
	blinkMicros();
	blinkElapsed();
}
