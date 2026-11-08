#ifndef LIB_SOFTWARE_SERIAL_H
#define LIB_SOFTWARE_SERIAL_H

// CORE
#include <core_gpio.h>
#include <core_software_serial_hardware.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

namespace lib_software_serial {

struct SoftwareSerialPort {
	core_gpio::Pin transmitPin;
	core_gpio::Pin receivePin;
};

const u8 CARRIAGE_RETURN_BYTE = 13;
const u8 LINE_FEED_BYTE = 10;

void initialize(core_object::Object<SoftwareSerialPort> &self, u32 baudRate);
void close(core_object::Object<SoftwareSerialPort> &self);
void flushOutput(core_object::Object<SoftwareSerialPort> &self);
void send(core_object::Object<SoftwareSerialPort> &self, core_string::String data);
void sendLine(core_object::Object<SoftwareSerialPort> &self, core_string::String data);
nullable<u8> read(core_object::Object<SoftwareSerialPort> &self);
core_string::String readLine(core_object::Object<SoftwareSerialPort> &self);
i32 readInteger(core_object::Object<SoftwareSerialPort> &self);
boolean hasData(core_object::Object<SoftwareSerialPort> &self);
void startListening(core_object::Object<SoftwareSerialPort> &self);
void stopListening(core_object::Object<SoftwareSerialPort> &self);
boolean isListening(core_object::Object<SoftwareSerialPort> &self);
boolean hasOverflowed(core_object::Object<SoftwareSerialPort> &self);
nullable<u8> getNextByte(core_object::Object<SoftwareSerialPort> &self);
core_object::Object<SoftwareSerialPort> getSoftwareSerial(core_gpio::Pin transmitPin, core_gpio::Pin receivePin);
u8 getSoftwareSerialReceiveCapacity();

}

#endif