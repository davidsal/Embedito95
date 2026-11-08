// CORE
#include "core/gpio/core_gpio.h"
#include "core/servo_hardware/core_servo_hardware.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
// LIBRARIES
#include "libraries/servo/lib_servo.h"

const core_gpio::Pin FIRST_PIN = core_gpio::Pin::PIN_A8;
const core_gpio::Pin SECOND_PIN = core_gpio::Pin::PIN_A9;
const core_gpio::Pin THIRD_PIN = core_gpio::Pin::PIN_A10;
const core_gpio::Pin FOURTH_PIN = core_gpio::Pin::PIN_A11;
const core_gpio::Pin UNSUPPORTED_PIN = core_gpio::Pin::PIN_B0;
core_object::Object<lib_servo::Servo> FIRST = lib_servo::getServo(FIRST_PIN);
core_object::Object<lib_servo::Servo> SECOND = lib_servo::getServo(SECOND_PIN);
core_object::Object<lib_servo::Servo> THIRD = lib_servo::getServo(THIRD_PIN);
core_object::Object<lib_servo::Servo> FOURTH = lib_servo::getServo(FOURTH_PIN);
core_object::Object<lib_servo::Servo> DISABLED = lib_servo::getServo(UNSUPPORTED_PIN);

int main() {
	// SETUP
	initializeSystemClock();
	lib_servo::setPulseRange(FIRST, 500, 2500);
	lib_servo::setAngle(FIRST, 180);
	lib_servo::setAngle(SECOND, 45);
	lib_servo::setPulseWidth(SECOND, 1750);
	lib_servo::setAngle(THIRD, 90);
	lib_servo::setAngle(FOURTH, 0);

	// MAIN
	lib_servo::setAngle(FIRST, 200);
	lib_servo::setPulseWidth(FIRST, 5000);
	const u8 angle = lib_servo::getAngle(FIRST);
	const u16 pulse = lib_servo::getPulseWidth(FIRST);
	const boolean active = lib_servo::isActive(FIRST);
	const boolean disabledActive = lib_servo::isActive(DISABLED);
	const u8 channelCount = lib_servo::getServoChannelCount();
	lib_servo::setAngle(DISABLED, 90);
	lib_servo::release(DISABLED);
	lib_servo::release(SECOND);
	lib_servo::release(THIRD);
	lib_servo::release(FOURTH);
	lib_servo::release(FIRST);
}
