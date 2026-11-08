// CORE
#include "core/gpio/core_gpio.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"

const core_gpio::Pin LED_PIN = core_gpio::Pin::PIN_LED_BUILTIN;
const core_gpio::Pin PWM_PIN = core_gpio::Pin::PIN_B9;
const core_gpio::Pin INPUT_PIN = core_gpio::Pin::PIN_A8;
const core_gpio::Pin ADC_PIN = core_gpio::Pin::PIN_A0;
const core_gpio::Pin SHIFT_DATA_PIN = core_gpio::Pin::PIN_B10;
const core_gpio::Pin SHIFT_CLOCK_PIN = core_gpio::Pin::PIN_B11;

void testPinMode() {
	core_gpio::setMode(LED_PIN, core_gpio::OUTPUT);
	core_gpio::setMode(PWM_PIN, core_gpio::OUTPUT);
	core_gpio::setMode(INPUT_PIN, core_gpio::INPUT);
	core_gpio::setMode(INPUT_PIN, core_gpio::INPUT_PULLUP);
	core_gpio::setMode(ADC_PIN, core_gpio::INPUT);
}

void testSetPinDigital() {
	core_gpio::setDigital(LED_PIN, core_gpio::HIGH);
	core_gpio::setDigital(LED_PIN, core_gpio::LOW);
	core_gpio::setDigital(LED_PIN, core_gpio::HIGH);
	core_gpio::setDigital(LED_PIN, core_gpio::LOW);
}

void testReadPinDigital() {
	core_gpio::setDigital(LED_PIN, core_gpio::getDigital(INPUT_PIN));
	core_gpio::setDigital(LED_PIN, core_gpio::getDigital(INPUT_PIN));
	core_gpio::setDigital(LED_PIN, core_gpio::getDigital(INPUT_PIN));
	core_gpio::setDigital(LED_PIN, core_gpio::getDigital(INPUT_PIN));
	core_gpio::setDigital(LED_PIN, core_gpio::getDigital(INPUT_PIN));
}

void testSetPinAnalog() {
	core_gpio::setAnalog(PWM_PIN, 0);
	core_gpio::setAnalog(PWM_PIN, 16384);
	core_gpio::setAnalog(PWM_PIN, 32768);
	core_gpio::setAnalog(PWM_PIN, 49152);
	core_gpio::setAnalog(PWM_PIN, 65535);
	core_gpio::setAnalog(PWM_PIN, 0);
}

void testReadPinAnalog() {
	core_gpio::setAnalog(PWM_PIN, core_gpio::getAnalog(ADC_PIN));
	core_gpio::setAnalog(PWM_PIN, core_gpio::getAnalog(ADC_PIN));
	core_gpio::setAnalog(PWM_PIN, core_gpio::getAnalog(ADC_PIN));
	core_gpio::setAnalog(PWM_PIN, core_gpio::getAnalog(ADC_PIN));
}

void testConfigureAnalog() {
	core_gpio::setReference(core_gpio::SUPPLY);
}

void testWriteShift() {
	core_gpio::writeShift(SHIFT_DATA_PIN, SHIFT_CLOCK_PIN, core_gpio::MSB_FIRST, 165);
	core_gpio::writeShift(SHIFT_DATA_PIN, SHIFT_CLOCK_PIN, core_gpio::LSB_FIRST, 60);
	core_gpio::writeShift(SHIFT_DATA_PIN, SHIFT_CLOCK_PIN, core_gpio::MSB_FIRST, 255);
}

void testReadShift() {
	core_gpio::setAnalog(PWM_PIN, core_gpio::readShift(SHIFT_DATA_PIN, SHIFT_CLOCK_PIN, core_gpio::MSB_FIRST));
	core_gpio::setAnalog(PWM_PIN, core_gpio::readShift(SHIFT_DATA_PIN, SHIFT_CLOCK_PIN, core_gpio::LSB_FIRST));
}

int main() {
	// SETUP
	initializeSystemClock();
	testPinMode();

	// MAIN
	testSetPinDigital();
	testReadPinDigital();
	testSetPinAnalog();
	testReadPinAnalog();
	testConfigureAnalog();
	testWriteShift();
	testReadShift();
}
