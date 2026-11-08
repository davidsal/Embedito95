#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_tim.h"

#include "core_servo_hardware.h"

namespace core_servo_hardware {

namespace {

const u8 CHANNEL_COUNT = 4;
const u8 CHANNEL_NONE = 0;
const u8 CHANNEL_FIRST = 1;
const u8 FIRST_CHANNEL_MASK = 0x01;
const u8 SECOND_CHANNEL_MASK = 0x02;
const u8 THIRD_CHANNEL_MASK = 0x04;
const u8 FOURTH_CHANNEL_MASK = 0x08;

const u32 MICROSECONDS_PER_SECOND = 1000000;
const u16 FRAME_PERIOD_MICROS = 20000;
const u32 CLOCK_HERTZ = 72000000;

// TIM1 runs at 72 MHz on APB2. Dividing by 72 gives a 1 MHz counter, so one
// timer tick is one microsecond and a 20 ms frame is 20000 ticks.
const u32 TIMER_PRESCALER = 72;
const u32 TIMER_TICKS_PER_MICROSECOND =
	CLOCK_HERTZ / (TIMER_PRESCALER * MICROSECONDS_PER_SECOND);
const u32 FRAME_TICKS = (u32)FRAME_PERIOD_MICROS * TIMER_TICKS_PER_MICROSECOND;
const u32 MAXIMUM_COMPARE_TICKS = FRAME_TICKS - 1;

struct ChannelDefinition {
	core_gpio::Pin pin;
	u32 llChannel;
	u8 activeMask;
};

const ChannelDefinition CHANNELS[CHANNEL_COUNT] = {
	{ core_gpio::PIN_A8, LL_TIM_CHANNEL_CH1, FIRST_CHANNEL_MASK },
	{ core_gpio::PIN_A9, LL_TIM_CHANNEL_CH2, SECOND_CHANNEL_MASK },
	{ core_gpio::PIN_A10, LL_TIM_CHANNEL_CH3, THIRD_CHANNEL_MASK },
	{ core_gpio::PIN_A11, LL_TIM_CHANNEL_CH4, FOURTH_CHANNEL_MASK },
};

u8 activeChannels = 0;

const ChannelDefinition *findChannel(u8 channel) {
	if (channel < CHANNEL_FIRST || channel > CHANNEL_COUNT) {
		return nullptr;
	}
	return &CHANNELS[channel - CHANNEL_FIRST];
}

void setCompare(u8 channel, u32 compareTicks) {
	switch (channel) {
		case 1: {
			LL_TIM_OC_SetCompareCH1(TIM1, compareTicks);
			break;
		}
		case 2: {
			LL_TIM_OC_SetCompareCH2(TIM1, compareTicks);
			break;
		}
		case 3: {
			LL_TIM_OC_SetCompareCH3(TIM1, compareTicks);
			break;
		}
		case 4: {
			LL_TIM_OC_SetCompareCH4(TIM1, compareTicks);
			break;
		}
		default: {
			break;
		}
	}
}

void configureTimer() {
	LL_APB2_GRP1_EnableClock(LL_APB2_GRP1_PERIPH_TIM1);
	LL_TIM_SetCounterMode(TIM1, LL_TIM_COUNTERMODE_UP);
	LL_TIM_SetPrescaler(TIM1, TIMER_PRESCALER - 1);
	LL_TIM_SetAutoReload(TIM1, FRAME_TICKS - 1);

	for (u8 index = 0; index < CHANNEL_COUNT; index++) {
		LL_TIM_OC_SetMode(TIM1, CHANNELS[index].llChannel, LL_TIM_OCMODE_PWM1);
		LL_TIM_OC_SetPolarity(
			TIM1, CHANNELS[index].llChannel, LL_TIM_OCPOLARITY_HIGH);
		LL_TIM_OC_EnablePreload(TIM1, CHANNELS[index].llChannel);
	}

	LL_TIM_SetCounter(TIM1, 0);
	LL_TIM_GenerateEvent_UPDATE(TIM1);
	LL_TIM_ClearFlag_UPDATE(TIM1);
	LL_TIM_EnableAllOutputs(TIM1);
	LL_TIM_EnableCounter(TIM1);
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
		(u32)pulseMicros * TIMER_TICKS_PER_MICROSECOND;
	const u32 compareTicks =
		requestedTicks > MAXIMUM_COMPARE_TICKS ? MAXIMUM_COMPARE_TICKS
											   : requestedTicks;
	core_gpio::_e95_setPinAlternate(definition->pin);
	setCompare(channel, compareTicks);
	LL_TIM_CC_EnableChannel(TIM1, definition->llChannel);
	activeChannels |= definition->activeMask;
}

void releaseChannel(u8 channel) {
	const ChannelDefinition *definition = findChannel(channel);

	if (definition == nullptr) {
		return;
	}

	LL_TIM_CC_DisableChannel(TIM1, definition->llChannel);
	setCompare(channel, 0);
	core_gpio::setMode(definition->pin, core_gpio::OUTPUT);
	core_gpio::setDigital(definition->pin, core_gpio::LOW);
	activeChannels &= (u8)~definition->activeMask;

	if (activeChannels == 0) {
		LL_TIM_DisableCounter(TIM1);
		LL_TIM_DisableAllOutputs(TIM1);
	}
}

} // namespace core_servo_hardware
