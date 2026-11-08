#include "lib_software_serial.h"

namespace lib_software_serial {

void initialize(core_object::Object<SoftwareSerialPort> &self, u32 baudRate) {
	if (!(core_software_serial_hardware::isBaudRateSupported(baudRate))) {
		return;
	}
	if (!(core_software_serial_hardware::openPort(self->transmitPin, self->receivePin, baudRate))) {
		return;
	}
	core_software_serial_hardware::startReceive(self->receivePin);
}

void close(core_object::Object<SoftwareSerialPort> &self) {
	core_software_serial_hardware::closePort(self->transmitPin, self->receivePin);
}

void flushOutput(core_object::Object<SoftwareSerialPort> &self) {

}

void send(core_object::Object<SoftwareSerialPort> &self, core_string::String data) {
	for (u16 index = 0; index < data.length(); index += 1) {
		core_software_serial_hardware::sendByte(self->transmitPin, ((u8)(data[index])));
	}
}

void sendLine(core_object::Object<SoftwareSerialPort> &self, core_string::String data) {
	for (u16 index = 0; index < data.length(); index += 1) {
		core_software_serial_hardware::sendByte(self->transmitPin, ((u8)(data[index])));
	}
	core_software_serial_hardware::sendByte(self->transmitPin, CARRIAGE_RETURN_BYTE);
	core_software_serial_hardware::sendByte(self->transmitPin, LINE_FEED_BYTE);
}

nullable<u8> read(core_object::Object<SoftwareSerialPort> &self) {
	if (!(core_software_serial_hardware::isReceiving(self->receivePin))) {
		return nullable<u8>{ true, 0 };
	}
	if (!(core_software_serial_hardware::hasBufferedData())) {
		return nullable<u8>{ true, 0 };
	}
	return nullable<u8>{ false, core_software_serial_hardware::readBufferedByte() };
}

core_string::String readLine(core_object::Object<SoftwareSerialPort> &self) {
	if (!(core_software_serial_hardware::isReceiving(self->receivePin))) {
		return "";
	}
	return core_software_serial_hardware::readStreamLine();
}

i32 readInteger(core_object::Object<SoftwareSerialPort> &self) {
	if (!(core_software_serial_hardware::isReceiving(self->receivePin))) {
		return 0;
	}
	return core_software_serial_hardware::readStreamInteger();
}

boolean hasData(core_object::Object<SoftwareSerialPort> &self) {
	if (!(core_software_serial_hardware::isReceiving(self->receivePin))) {
		return false;
	}
	return core_software_serial_hardware::hasBufferedData();
}

void startListening(core_object::Object<SoftwareSerialPort> &self) {
	core_software_serial_hardware::startReceive(self->receivePin);
}

void stopListening(core_object::Object<SoftwareSerialPort> &self) {
	core_software_serial_hardware::stopReceive(self->receivePin);
}

boolean isListening(core_object::Object<SoftwareSerialPort> &self) {
	return core_software_serial_hardware::isReceiving(self->receivePin);
}

boolean hasOverflowed(core_object::Object<SoftwareSerialPort> &self) {
	return core_software_serial_hardware::hasReceiveOverflow();
}

nullable<u8> getNextByte(core_object::Object<SoftwareSerialPort> &self) {
	if (!(core_software_serial_hardware::isReceiving(self->receivePin))) {
		return nullable<u8>{ true, 0 };
	}
	if (!(core_software_serial_hardware::hasBufferedData())) {
		return nullable<u8>{ true, 0 };
	}
	return nullable<u8>{ false, core_software_serial_hardware::peekBufferedByte() };
}

core_object::Object<SoftwareSerialPort> getSoftwareSerial(core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	return core_object::Object<SoftwareSerialPort>(SoftwareSerialPort{ transmitPin, receivePin });
}

u8 getSoftwareSerialReceiveCapacity() {
	return core_software_serial_hardware::getReceiveCapacity();
}

}