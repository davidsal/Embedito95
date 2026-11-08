#ifndef LIB_SERVO_H
#define LIB_SERVO_H

// CORE
#include "../../core/gpio/core_gpio.h"
#include "../../core/servo_hardware/core_servo_hardware.h"
#include "../../core/system/core_system.h"
#include "../../core/type/core_type.h"

namespace lib_servo {

struct Servo {
	u8 channel;
	u8 angleDegrees;
	u16 pulseMicros;
	u16 minimumPulseMicros;
	u16 maximumPulseMicros;
};

const u16 DEFAULT_MINIMUM_PULSE_MICROS = 1000;
const u16 DEFAULT_MAXIMUM_PULSE_MICROS = 2000;
const u16 MAXIMUM_PULSE_MICROS = 19000;
const u8 MINIMUM_ANGLE_DEGREES = 0;
const u8 MAXIMUM_ANGLE_DEGREES = 180;
const u8 INITIAL_ANGLE_DEGREES = 90;
const u16 INITIAL_PULSE_MICROS = 1500;
const u32 ANGLE_SPAN_DEGREES = 180;
const u8 NO_CHANNEL = 0;

boolean isActive(core_object::Object<Servo> &self);
void setAngle(core_object::Object<Servo> &self, u8 angle);
u8 getAngle(core_object::Object<Servo> &self);
void setPulseWidth(core_object::Object<Servo> &self, u16 requestedMicros);
u16 getPulseWidth(core_object::Object<Servo> &self);
void setPulseRange(core_object::Object<Servo> &self, u16 minimumMicros, u16 maximumMicros);
void release(core_object::Object<Servo> &self);
core_object::Object<Servo> getServo(core_gpio::Pin pin);
u16 resolvePulseMicros(u8 angleDegrees, u16 minimumPulseMicros, u16 maximumPulseMicros);
u8 resolveAngleDegrees(u16 pulseMicros, u16 minimumPulseMicros, u16 maximumPulseMicros);
u8 getServoChannelCount();

}

#endif