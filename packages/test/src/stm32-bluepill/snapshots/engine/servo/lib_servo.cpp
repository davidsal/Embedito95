#include "lib_servo.h"

namespace lib_servo {

boolean isActive(core_object::Object<Servo> &self) {
	return self->channel != NO_CHANNEL;
}

void setAngle(core_object::Object<Servo> &self, u8 angle) {
	if (self->channel == NO_CHANNEL) {
		return;
	}
	const u8 clamped = angle > MAXIMUM_ANGLE_DEGREES ? MAXIMUM_ANGLE_DEGREES : angle;
	self->angleDegrees = clamped;
	self->pulseMicros = resolvePulseMicros(clamped, self->minimumPulseMicros, self->maximumPulseMicros);
	core_servo_hardware::setChannelPulse(self->channel, self->pulseMicros);
}

u8 getAngle(core_object::Object<Servo> &self) {
	return self->angleDegrees;
}

void setPulseWidth(core_object::Object<Servo> &self, u16 requestedMicros) {
	if (self->channel == NO_CHANNEL) {
		return;
	}
	u16 clamped = requestedMicros;
	if (clamped < self->minimumPulseMicros) {
		clamped = self->minimumPulseMicros;
	}
	if (clamped > self->maximumPulseMicros) {
		clamped = self->maximumPulseMicros;
	}
	self->pulseMicros = clamped;
	self->angleDegrees = resolveAngleDegrees(clamped, self->minimumPulseMicros, self->maximumPulseMicros);
	core_servo_hardware::setChannelPulse(self->channel, clamped);
}

u16 getPulseWidth(core_object::Object<Servo> &self) {
	return self->pulseMicros;
}

void setPulseRange(core_object::Object<Servo> &self, u16 minimumMicros, u16 maximumMicros) {
	if (self->channel == NO_CHANNEL) {
		return;
	}
	if ((i32)(minimumMicros) == (i32)(0)) {
		return;
	}
	if (maximumMicros <= minimumMicros) {
		return;
	}
	if (maximumMicros > MAXIMUM_PULSE_MICROS) {
		return;
	}
	self->minimumPulseMicros = minimumMicros;
	self->maximumPulseMicros = maximumMicros;
	self->pulseMicros = resolvePulseMicros(self->angleDegrees, self->minimumPulseMicros, self->maximumPulseMicros);
	core_servo_hardware::setChannelPulse(self->channel, self->pulseMicros);
}

void release(core_object::Object<Servo> &self) {
	if (self->channel == NO_CHANNEL) {
		return;
	}
	core_servo_hardware::releaseChannel(self->channel);
	self->channel = NO_CHANNEL;
}

core_object::Object<Servo> getServo(core_gpio::Pin pin) {
	return core_object::Object<Servo>(Servo{ core_servo_hardware::getChannel(pin), INITIAL_ANGLE_DEGREES, INITIAL_PULSE_MICROS, DEFAULT_MINIMUM_PULSE_MICROS, DEFAULT_MAXIMUM_PULSE_MICROS });
}

u16 resolvePulseMicros(u8 angleDegrees, u16 minimumPulseMicros, u16 maximumPulseMicros) {
	const u32 spanMicros = (u32)((i64)(((u32)(maximumPulseMicros))) - (i64)(((u32)(minimumPulseMicros))));
	const u32 offsetMicros = (spanMicros * ((u32)(angleDegrees))) / ANGLE_SPAN_DEGREES;
	return (u16)((((u32)(minimumPulseMicros)) + offsetMicros));
}

u8 resolveAngleDegrees(u16 pulseMicros, u16 minimumPulseMicros, u16 maximumPulseMicros) {
	if (maximumPulseMicros <= minimumPulseMicros) {
		return MINIMUM_ANGLE_DEGREES;
	}
	if (pulseMicros <= minimumPulseMicros) {
		return MINIMUM_ANGLE_DEGREES;
	}
	if (pulseMicros >= maximumPulseMicros) {
		return MAXIMUM_ANGLE_DEGREES;
	}
	const u32 offsetMicros = (u32)((i64)(((u32)(pulseMicros))) - (i64)(((u32)(minimumPulseMicros))));
	const u32 spanMicros = (u32)((i64)(((u32)(maximumPulseMicros))) - (i64)(((u32)(minimumPulseMicros))));
	return (u8)(((offsetMicros * ANGLE_SPAN_DEGREES) / spanMicros));
}

u8 getServoChannelCount() {
	return core_servo_hardware::getChannelCount();
}

}