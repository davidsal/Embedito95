#ifndef _E95_RUNTIME_HOST_CORE_SERVO_HARDWARE_H
#define _E95_RUNTIME_HOST_CORE_SERVO_HARDWARE_H
// Host stand-in for the generated `core_servo_hardware.h`. It declares the same
// pulse-channel surface the servo library calls; the runtime test supplies a
// recording double, so the library's clamping, range and handle logic are
// exercised without touching a real timer register.
#include <core_gpio.h>
#include <core_type.h>

namespace core_servo_hardware {

u8 getChannelCount();
u8 getChannel(core_gpio::Pin pin);
void setChannelPulse(u8 channel, u16 pulseMicros);
void releaseChannel(u8 channel);

} // namespace core_servo_hardware

#endif
