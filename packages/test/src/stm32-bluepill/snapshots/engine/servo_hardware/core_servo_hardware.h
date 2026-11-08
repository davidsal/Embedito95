#ifndef _E95_SERVO_HARDWARE_H
#define _E95_SERVO_HARDWARE_H

#include "../gpio/core_gpio.h"
#include "../type/core_type.h"

namespace core_servo_hardware {

// STM32F103 (Blue Pill): TIM1, an advanced-control timer clocked from APB2,
// drives CH1..CH4 on PA8..PA11. The four channels share the 50 Hz frame.
u8 getChannelCount();
u8 getChannel(core_gpio::Pin pin);
void setChannelPulse(u8 channel, u16 pulseMicros);
void releaseChannel(u8 channel);

} // namespace core_servo_hardware

#endif
