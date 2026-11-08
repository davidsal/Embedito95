// CORE
#include <core_timer.h>
#include <core_gpio.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

const u32 FIRST_PERIOD_MICROS = 1000;
const u32 SECOND_PERIOD_MICROS = 2000;
const u16 TONE_FREQUENCY_HERTZ = 440;
const u32 PULSE_TIMEOUT_MICROS = 1000;
core_timer::HardwareTimer firstTimer = core_timer::getTimer(core_timer::Timer::TIMER_1);
core_timer::HardwareTimer secondTimer = core_timer::getTimer(core_timer::Timer::TIMER_2);

void onPeriod() {

}

void configure() {
	firstTimer.initialize(FIRST_PERIOD_MICROS, onPeriod);
	secondTimer.initialize(FIRST_PERIOD_MICROS, onPeriod);
}

void playTone() {
	core_timer::startTone(core_timer::Timer::TIMER_2, core_gpio::Pin::PIN_2, TONE_FREQUENCY_HERTZ);
	core_timer::stopTone(core_gpio::Pin::PIN_2);
}

u32 measurePulse() {
	return core_timer::measurePulseWidth(core_gpio::Pin::PIN_3, core_gpio::HIGH, PULSE_TIMEOUT_MICROS);
}

void setup() {
	// SETUP
	configure();
	firstTimer.start();
	secondTimer.start();

	// MAIN
	firstTimer.setPeriod(SECOND_PERIOD_MICROS);
	secondTimer.setPeriod(SECOND_PERIOD_MICROS);
	firstTimer.stop();
	secondTimer.stop();
	playTone();
	const u32 pulseWidthMicros = measurePulse();
}

void loop() {
}
