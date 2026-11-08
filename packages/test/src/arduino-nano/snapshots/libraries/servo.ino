// CORE
#include <core_gpio.h>
#include <core_servo_hardware.h>
#include <core_system.h>
#include <core_type.h>
// LIBRARIES
#include <lib_servo.h>

const core_gpio::Pin ARM_PIN = core_gpio::Pin::PIN_9;
const core_gpio::Pin SPARE_PIN = core_gpio::Pin::PIN_10;
const core_gpio::Pin UNSUPPORTED_PIN = core_gpio::Pin::PIN_5;
core_object::Object<lib_servo::Servo> ARM = lib_servo::getServo(ARM_PIN);
core_object::Object<lib_servo::Servo> SPARE = lib_servo::getServo(SPARE_PIN);
core_object::Object<lib_servo::Servo> DISABLED = lib_servo::getServo(UNSUPPORTED_PIN);

void setup() {
	// SETUP
	lib_servo::setPulseRange(ARM, 500, 2500);
	lib_servo::setAngle(ARM, 180);
	lib_servo::setAngle(SPARE, 45);
	lib_servo::setPulseWidth(SPARE, 1750);

	// MAIN
	lib_servo::setAngle(ARM, 200);
	lib_servo::setPulseWidth(ARM, 5000);
	const u8 angle = lib_servo::getAngle(ARM);
	const u16 pulse = lib_servo::getPulseWidth(ARM);
	const boolean active = lib_servo::isActive(ARM);
	const boolean disabledActive = lib_servo::isActive(DISABLED);
	const u8 channelCount = lib_servo::getServoChannelCount();
	lib_servo::setAngle(DISABLED, 90);
	lib_servo::release(DISABLED);
	lib_servo::release(SPARE);
	lib_servo::release(ARM);
}

void loop() {
}
