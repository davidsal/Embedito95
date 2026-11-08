#ifndef _E95_SOFTWARE_SERIAL_HARDWARE_H
#define _E95_SOFTWARE_SERIAL_HARDWARE_H
// Host stand-in for the generated `core_software_serial_hardware.h`. The
// runtime test compiles the real generated `lib_software_serial.cpp` against
// these declarations and supplies the recording implementations, so the library
// delegation (single listener, buffer reads, overflow flag, close) is executed
// without an AVR. The AVR register behaviour lives in
// software-serial-arduino-config.test.cpp against the real generated driver.
#include <core_gpio.h>
#include <core_string.h>
#include <core_type.h>

namespace core_software_serial_hardware {

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
