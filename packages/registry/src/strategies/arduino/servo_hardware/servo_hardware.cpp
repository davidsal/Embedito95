#include <avr/io.h>

#include "core_servo_hardware.h"

namespace core_servo_hardware {

namespace {

const u8 CHANNEL_COUNT = 2;
const u8 CHANNEL_NONE = 0;
const u8 CHANNEL_FIRST = 1;
const u8 FIRST_CHANNEL_MASK = 0x01;
const u8 SECOND_CHANNEL_MASK = 0x02;

const u16 FRAME_PERIOD_MICROS = 20000;
const u32 MICROSECONDS_PER_SECOND = 1000000;
const u32 FRAME_FREQUENCY_HERTZ = MICROSECONDS_PER_SECOND / FRAME_PERIOD_MICROS;

// Timer1 is clocked directly from the 16 MHz system clock. Dividing by eight
// gives a 2 MHz counter, so one microsecond is two timer ticks and a 20 ms
// frame is 40000 ticks, which fits the 16-bit counter.
const u32 TIMER_PRESCALER = 8;
const u16 TIMER_TICKS_PER_MICROSECOND =
	(u16)(F_CPU / (TIMER_PRESCALER * MICROSECONDS_PER_SECOND));
const u16 TIMER_TOP =
	(u16)(F_CPU / (TIMER_PRESCALER * FRAME_FREQUENCY_HERTZ) - 1);

// Compare output bits of TCCR1A. Mode 14 (fast PWM, TOP = ICR1) with the
// prescaler bits in TCCR1B keeps the frame frequency independent of the
// compare values.
const u8 TIMER_WAVEFORM_MODE_BIT = WGM11;
const u8 TIMER_COUNTER_MODE_BITS = (u8)(_BV(WGM13) | _BV(WGM12));
const u8 TIMER_CLOCK_SELECT_BITS = (u8)_BV(CS11);

struct ChannelDefinition {
	core_gpio::Pin pin;
	volatile u16 *compareRegister;
	u8 outputEnableBit;
	u8 activeMask;
};

const ChannelDefinition CHANNELS[CHANNEL_COUNT] = {
	{ core_gpio::PIN_9, &OCR1A, COM1A1, FIRST_CHANNEL_MASK },
	{ core_gpio::PIN_10, &OCR1B, COM1B1, SECOND_CHANNEL_MASK },
};

u8 activeChannels = 0;

const ChannelDefinition *findChannel(u8 channel) {
	if (channel < CHANNEL_FIRST || channel > CHANNEL_COUNT) {
		return nullptr;
	}
	return &CHANNELS[channel - CHANNEL_FIRST];
}

void configureTimer() {
	TCCR1A = (u8)_BV(TIMER_WAVEFORM_MODE_BIT);
	TCCR1B = (u8)(TIMER_COUNTER_MODE_BITS | TIMER_CLOCK_SELECT_BITS);
	ICR1 = TIMER_TOP;
}

} // namespace

u8 getChannelCount() {
	return CHANNEL_COUNT;
}

u8 getChannel(core_gpio::Pin pin) {
	for (u8 index = 0; index < CHANNEL_COUNT; index++) {
		if (CHANNELS[index].pin == pin) {
			return (u8)(index + CHANNEL_FIRST);
		}
	}
	return CHANNEL_NONE;
}

void setChannelPulse(u8 channel, u16 pulseMicros) {
	const ChannelDefinition *definition = findChannel(channel);

	if (definition == nullptr) {
		return;
	}

	if (activeChannels == 0) {
		configureTimer();
	}

	const u32 requestedTicks =
		(u32)pulseMicros * (u32)TIMER_TICKS_PER_MICROSECOND;
	*definition->compareRegister =
		(u16)(requestedTicks > (u32)TIMER_TOP ? TIMER_TOP : requestedTicks);
	core_gpio::setMode(definition->pin, core_gpio::OUTPUT);
	TCCR1A |= (u8)_BV(definition->outputEnableBit);
	activeChannels |= definition->activeMask;
}

void releaseChannel(u8 channel) {
	const ChannelDefinition *definition = findChannel(channel);

	if (definition == nullptr) {
		return;
	}

	TCCR1A &= (u8)~_BV(definition->outputEnableBit);
	*definition->compareRegister = 0;
	core_gpio::setDigital(definition->pin, core_gpio::LOW);
	activeChannels &= (u8)~definition->activeMask;

	if (activeChannels == 0) {
		TCCR1B = 0;
		TCCR1A = 0;
	}
}

} // namespace core_servo_hardware
