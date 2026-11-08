#ifndef _E95_SERVO_HARDWARE_H
#define _E95_SERVO_HARDWARE_H

#include <core_gpio.h>
#include <core_type.h>

namespace core_servo_hardware {

// ATmega328P (Nano/Uno): Timer1 drives OCR1A/OCR1B on pins 9/10. Both channels
// share the counter and therefore the 50 Hz frame.
u8 getChannelCount();
u8 getChannel(core_gpio::Pin pin);
void setChannelPulse(u8 channel, u16 pulseMicros);
void releaseChannel(u8 channel);

} // namespace core_servo_hardware

#endif
