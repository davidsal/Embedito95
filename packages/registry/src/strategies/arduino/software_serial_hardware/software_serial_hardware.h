#ifndef _E95_SOFTWARE_SERIAL_HARDWARE_H
#define _E95_SOFTWARE_SERIAL_HARDWARE_H

#include <core_gpio.h>
#include <core_string.h>
#include <core_type.h>

namespace core_software_serial_hardware {

// ATmega328P (Nano/Uno) in the standard variant.
//
// Receive uses a pin-change interrupt: every digital pin D0-D13 and every
// analog pin A0-A5 has a channel, but only one pin owns the receive line at a
// time. A6/A7 are ADC-only inputs without a pin-change channel, so they are
// rejected as receive pins and cannot transmit either.
//
// Transmit bit-bangs one start bit, eight data bits (least significant first)
// and one stop bit. The supported range at 16 MHz is 300-57600 baud: at 57600
// the receive centering delay still has room for the fixed interrupt overhead,
// while 115200 leaves only 17 loop units for the half bit and saturates the
// centering subtraction. These margins come from the AVR instruction sequence,
// not from bench measurements. The floor is a sampling-accuracy limit, not a
// counter overflow: the 16-bit loop counter would only overflow below roughly
// 61 baud.
const u8 RECEIVE_CAPACITY = 64;

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
