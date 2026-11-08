#ifndef _E95_SOFTWARE_SERIAL_HARDWARE_H
#define _E95_SOFTWARE_SERIAL_HARDWARE_H

#include "../gpio/core_gpio.h"
#include "../type/core_string.h"
#include "../type/core_type.h"

namespace core_software_serial_hardware {

// STM32F103C8T6 (Blue Pill) at 72 MHz.
//
// Receive samples the line from the TIM4 update interrupt at three times the
// bit rate (oversampling 3). One timer drives the single listening handle, so
// no edge interrupt or per-instance timer is needed. Transmit bit-bangs one
// start bit, eight data bits (least significant first) and one stop bit, using
// the DWT cycle counter for the bit period.
//
// The supported range is 300-115200 baud. Below 300 the timer countdown loses
// sampling resolution; above 115200 the same countdown is too short for the
// interrupt entry overhead. Rates outside the range are rejected before TIM4
// is touched. The receive buffer holds 64 bytes and drops the oldest byte on
// overflow; only one handle can listen at a time.
_e95_replace_pinCount

u8 getReceiveCapacity();
boolean isBaudRateSupported(u32 baudRate);
boolean isReceivePin(core_gpio::Pin pin);
u8 getPinChangeGroup(core_gpio::Pin pin);
u8 getPinChangeBit(core_gpio::Pin pin);

boolean openPort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin, u32 baudRate);
void closePort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin);
void startReceive(core_gpio::Pin receivePin);
void stopReceive(core_gpio::Pin receivePin);
boolean isReceiving(core_gpio::Pin receivePin);

void sendByte(core_gpio::Pin transmitPin, u8 value);

boolean hasBufferedData();
u8 readBufferedByte();
u8 peekBufferedByte();
boolean hasReceiveOverflow();
void storeReceivedByte(u8 value);

core_string::String readStreamLine();
i32 readStreamInteger();

} // namespace core_software_serial_hardware

#endif
