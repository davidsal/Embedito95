// Host compile+behaviour guard for the *generated* servo library
// (src/arduino-nano/snapshots/engine/servo/lib_servo.cpp). The generated
// translation unit is compiled verbatim against a recording double of
// core_servo_hardware (host/core_servo_hardware.h), so the library logic -
// clamping, the configurable pulse range, the inactive-handle no-ops, the
// angle/pulse conversion and release - is executed instead of only pinned by a
// snapshot. The AVR register behaviour is covered separately by
// servo-arduino-config.test.cpp.

#include <stdint.h>
#include <stdio.h>

#include <core_object.h>
#include <core_servo_hardware.h>

static const u8 SUPPORTED_CHANNEL_COUNT = 2;
static const u8 CHANNEL_NONE = 0;
static const u8 FIRST_CHANNEL = 1;
static const u8 SECOND_CHANNEL = 2;

static const u16 DEFAULT_MINIMUM_PULSE_MICROS = 1000;
static const u16 DEFAULT_MAXIMUM_PULSE_MICROS = 2000;
static const u8 INITIAL_ANGLE_DEGREES = 90;
static const u16 INITIAL_PULSE_MICROS = 1500;
static const u8 MINIMUM_ANGLE_DEGREES = 0;
static const u8 MAXIMUM_ANGLE_DEGREES = 180;

// The double keeps one recorded pulse per channel plus the call counters, so a
// test can assert both the value the library commanded and whether it commanded
// anything at all.
static u16 channelPulses[SUPPORTED_CHANNEL_COUNT + 1] = {0};
static uint32_t setPulseCallCount = 0;
static uint32_t releaseCallCount = 0;
static u8 lastReleasedChannel = 0;

u8 core_servo_hardware::getChannelCount() {
	return SUPPORTED_CHANNEL_COUNT;
}

u8 core_servo_hardware::getChannel(core_gpio::Pin pin) {
	if (pin == core_gpio::PIN_9) {
		return FIRST_CHANNEL;
	}
	if (pin == core_gpio::PIN_10) {
		return SECOND_CHANNEL;
	}
	return CHANNEL_NONE;
}

void core_servo_hardware::setChannelPulse(u8 channel, u16 pulseMicros) {
	if (channel == CHANNEL_NONE || channel > SUPPORTED_CHANNEL_COUNT) {
		return;
	}
	channelPulses[channel] = pulseMicros;
	setPulseCallCount++;
}

void core_servo_hardware::releaseChannel(u8 channel) {
	if (channel == CHANNEL_NONE || channel > SUPPORTED_CHANNEL_COUNT) {
		return;
	}
	releaseCallCount++;
	lastReleasedChannel = channel;
}

#include "packages/test/src/arduino-nano/snapshots/engine/servo/lib_servo.cpp"

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void resetDouble() {
	for (u8 channel = 0; channel <= SUPPORTED_CHANNEL_COUNT; channel++) {
		channelPulses[channel] = 0;
	}
	setPulseCallCount = 0;
	releaseCallCount = 0;
	lastReleasedChannel = 0;
}

static core_object::Object<lib_servo::Servo> createServo(core_gpio::Pin pin) {
	return lib_servo::getServo(pin);
}

static void scenarioReportsChannelsFromPins() {
	resetDouble();

	core_object::Object<lib_servo::Servo> supported =
		createServo(core_gpio::PIN_9);
	core_object::Object<lib_servo::Servo> secondSupported =
		createServo(core_gpio::PIN_10);
	core_object::Object<lib_servo::Servo> unsupported =
		createServo(core_gpio::PIN_5);

	CHECK(lib_servo::getServoChannelCount() == SUPPORTED_CHANNEL_COUNT);
	CHECK(lib_servo::isActive(supported));
	CHECK(lib_servo::isActive(secondSupported));
	CHECK(!lib_servo::isActive(unsupported));
}

static void scenarioClampsAngleToRange() {
	resetDouble();
	core_object::Object<lib_servo::Servo> servo =
		createServo(core_gpio::PIN_9);

	lib_servo::setAngle(servo, 200);
	CHECK(lib_servo::getAngle(servo) == MAXIMUM_ANGLE_DEGREES);
	CHECK(channelPulses[FIRST_CHANNEL] == DEFAULT_MAXIMUM_PULSE_MICROS);

	lib_servo::setAngle(servo, 0);
	CHECK(lib_servo::getAngle(servo) == MINIMUM_ANGLE_DEGREES);
	CHECK(channelPulses[FIRST_CHANNEL] == DEFAULT_MINIMUM_PULSE_MICROS);

	lib_servo::setAngle(servo, 90);
	CHECK(lib_servo::getAngle(servo) == 90);
	CHECK(setPulseCallCount == 3);
}

static void scenarioClampsPulseWidthToConfiguredRange() {
	resetDouble();
	core_object::Object<lib_servo::Servo> servo =
		createServo(core_gpio::PIN_9);

	lib_servo::setPulseWidth(servo, 500);
	CHECK(lib_servo::getPulseWidth(servo) == DEFAULT_MINIMUM_PULSE_MICROS);
	CHECK(lib_servo::getAngle(servo) == MINIMUM_ANGLE_DEGREES);

	lib_servo::setPulseWidth(servo, 5000);
	CHECK(lib_servo::getPulseWidth(servo) == DEFAULT_MAXIMUM_PULSE_MICROS);
	CHECK(lib_servo::getAngle(servo) == MAXIMUM_ANGLE_DEGREES);

	lib_servo::setPulseWidth(servo, 1500);
	CHECK(lib_servo::getPulseWidth(servo) == INITIAL_PULSE_MICROS);
	CHECK(lib_servo::getAngle(servo) == INITIAL_ANGLE_DEGREES);
	CHECK(channelPulses[FIRST_CHANNEL] == INITIAL_PULSE_MICROS);
}

static void scenarioRejectsInvalidPulseRanges() {
	resetDouble();
	core_object::Object<lib_servo::Servo> servo =
		createServo(core_gpio::PIN_9);

	// Zero minimum: refused, so 500 still clamps up to the default minimum.
	lib_servo::setPulseRange(servo, 0, 1500);
	lib_servo::setPulseWidth(servo, 500);
	CHECK(lib_servo::getPulseWidth(servo) == DEFAULT_MINIMUM_PULSE_MICROS);

	// Maximum not above the minimum: refused, so 1600 stays inside the default.
	lib_servo::setPulseRange(servo, 1500, 1500);
	lib_servo::setPulseWidth(servo, 1600);
	CHECK(lib_servo::getPulseWidth(servo) == 1600);

	// Maximum beyond the frame: refused, so 20000 clamps to the default maximum.
	lib_servo::setPulseRange(servo, 1000, 25000);
	lib_servo::setPulseWidth(servo, 20000);
	CHECK(lib_servo::getPulseWidth(servo) == DEFAULT_MAXIMUM_PULSE_MICROS);
}

static void scenarioAcceptsValidPulseRangeAndKeepsAngle() {
	resetDouble();
	core_object::Object<lib_servo::Servo> servo =
		createServo(core_gpio::PIN_9);

	lib_servo::setAngle(servo, 90);
	lib_servo::setPulseRange(servo, 500, 2500);

	CHECK(lib_servo::getAngle(servo) == 90);
	CHECK(lib_servo::getPulseWidth(servo) == 1500);
	CHECK(channelPulses[FIRST_CHANNEL] == 1500);

	lib_servo::setAngle(servo, 0);
	CHECK(channelPulses[FIRST_CHANNEL] == 500);
	lib_servo::setAngle(servo, 180);
	CHECK(channelPulses[FIRST_CHANNEL] == 2500);
}

static void scenarioInactiveHandleIgnoresEveryOperation() {
	resetDouble();
	core_object::Object<lib_servo::Servo> servo =
		createServo(core_gpio::PIN_5);

	CHECK(!lib_servo::isActive(servo));

	lib_servo::setAngle(servo, 0);
	lib_servo::setPulseRange(servo, 500, 1500);
	lib_servo::setPulseWidth(servo, 800);
	lib_servo::release(servo);

	CHECK(lib_servo::getAngle(servo) == INITIAL_ANGLE_DEGREES);
	CHECK(lib_servo::getPulseWidth(servo) == INITIAL_PULSE_MICROS);
	CHECK(setPulseCallCount == 0);
	CHECK(releaseCallCount == 0);
}

static void scenarioConvertsAngleAndPulse() {
	resetDouble();
	core_object::Object<lib_servo::Servo> servo =
		createServo(core_gpio::PIN_9);

	lib_servo::setAngle(servo, 0);
	CHECK(channelPulses[FIRST_CHANNEL] == 1000);
	lib_servo::setAngle(servo, 45);
	CHECK(channelPulses[FIRST_CHANNEL] == 1250);
	lib_servo::setAngle(servo, 180);
	CHECK(channelPulses[FIRST_CHANNEL] == 2000);

	lib_servo::setPulseWidth(servo, 1250);
	CHECK(lib_servo::getAngle(servo) == 45);
	lib_servo::setPulseWidth(servo, 1000);
	CHECK(lib_servo::getAngle(servo) == MINIMUM_ANGLE_DEGREES);
	lib_servo::setPulseWidth(servo, 2000);
	CHECK(lib_servo::getAngle(servo) == MAXIMUM_ANGLE_DEGREES);
}

static void scenarioReleasesChannelAndStaysInactive() {
	resetDouble();
	core_object::Object<lib_servo::Servo> servo =
		createServo(core_gpio::PIN_9);

	lib_servo::setAngle(servo, 90);
	lib_servo::release(servo);

	CHECK(!lib_servo::isActive(servo));
	CHECK(releaseCallCount == 1);
	CHECK(lastReleasedChannel == FIRST_CHANNEL);

	// Releasing again is a no-op; the channel was already returned.
	lib_servo::release(servo);
	CHECK(releaseCallCount == 1);

	// After release every command is a no-op as well.
	lib_servo::setAngle(servo, 0);
	CHECK(lib_servo::getAngle(servo) == INITIAL_ANGLE_DEGREES);
}

static void scenarioReusingPinSharesOneChannel() {
	resetDouble();
	core_object::Object<lib_servo::Servo> first =
		createServo(core_gpio::PIN_9);
	core_object::Object<lib_servo::Servo> second =
		createServo(core_gpio::PIN_9);

	CHECK(lib_servo::isActive(first));
	CHECK(lib_servo::isActive(second));

	lib_servo::setAngle(first, INITIAL_ANGLE_DEGREES);
	CHECK(setPulseCallCount == 1);

	// The pin is the shared resource: releasing one handle turns the shared
	// output off, while the sibling keeps reporting itself active.
	lib_servo::release(first);
	CHECK(releaseCallCount == 1);
	CHECK(lib_servo::isActive(second));

	// The released handle is dead, but the sibling still owns the channel and
	// drives the output again on its next command.
	lib_servo::setAngle(second, MINIMUM_ANGLE_DEGREES);
	CHECK(setPulseCallCount == 2);
	CHECK(channelPulses[FIRST_CHANNEL] == DEFAULT_MINIMUM_PULSE_MICROS);
}

int main() {
	scenarioReportsChannelsFromPins();
	scenarioClampsAngleToRange();
	scenarioClampsPulseWidthToConfiguredRange();
	scenarioRejectsInvalidPulseRanges();
	scenarioAcceptsValidPulseRangeAndKeepsAngle();
	scenarioInactiveHandleIgnoresEveryOperation();
	scenarioConvertsAngleAndPulse();
	scenarioReleasesChannelAndStaysInactive();
	scenarioReusingPinSharesOneChannel();

	if (failures > 0) {
		printf("servo-library: %d failure(s)\n", failures);
		return 1;
	}

	printf("servo-library: all checks passed\n");
	return 0;
}
