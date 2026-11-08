#include <Arduino.h>
#include "core_serial.h"

namespace core_serial {

_e95_replace_serialCommon

SerialPort::SerialPort(HardwareSerial &handle) {
	this->body_ = core_mem::Ref<SerialPortBody>::emplace();
	this->body_->handle = &handle;
	this->body_->hasPendingByte = false;
	this->body_->pendingByte = 0;
	this->body_->readTimeoutMillis = serial_detail::READ_TIMEOUT_MILLIS;
}

nullable<u8> SerialPort::read() const {
	if (body_->hasPendingByte) {
		body_->hasPendingByte = false;
		nullable<u8> pending;
		pending.isNull = false;
		pending.value = body_->pendingByte;
		return pending;
	}
	nullable<u8> result;
	result.isNull = body_->handle->available() == 0;
	result.value = result.isNull ? 0 : (u8)body_->handle->read();
	return result;
}

nullable<u8> SerialPort::peekByte() const {
	serial_detail::peekByteInto(*this, body_->hasPendingByte, body_->pendingByte);
	nullable<u8> result;
	result.isNull = !body_->hasPendingByte;
	result.value = result.isNull ? 0 : body_->pendingByte;
	return result;
}

u16 SerialPort::getWriteSpace() const {
	return (u16)body_->handle->availableForWrite();
}

core_array::Array<u8> SerialPort::readBlock(u16 maximum) const {
	core_array::Array<u8> received;
	serial_detail::readBlockInto(*this, received, maximum, body_->readTimeoutMillis, &core_time::getMillis);
	return received;
}

core_array::Array<u8> SerialPort::readBlockUntil(u8 terminator, u16 maximum) const {
	core_array::Array<u8> received;
	serial_detail::readBlockUntilInto(*this, received, terminator, maximum, body_->readTimeoutMillis, &core_time::getMillis);
	return received;
}

void SerialPort::sendBuffer(const core_array::Array<u8> &data) const {
	for (u16 index = 0; index < data.length(); index++) {
		body_->handle->write(data[index]);
	}
}

core_string::String SerialPort::readLine() const {
	return readTextUntil(serial_detail::NEWLINE_CHARACTER);
}

core_string::String SerialPort::readTextUntil(char terminator) const {
	core_string::String text;
	serial_detail::readLineInto(*this, text, body_->readTimeoutMillis, &core_time::getMillis, terminator);
	return text;
}

core_string::String SerialPort::readText() const {
	core_string::String text;
	serial_detail::readTextInto(*this, text, body_->readTimeoutMillis, &core_time::getMillis);
	return text;
}

bool SerialPort::findText(const core_string::String &needle) const {
	return serial_detail::findTextInto(*this, needle.c_str(), needle.length(), body_->readTimeoutMillis, &core_time::getMillis);
}

bool SerialPort::findTextUntil(const core_string::String &needle, char terminator) const {
	return serial_detail::findTextUntilInto(*this, needle.c_str(), needle.length(), (u8)terminator, true, body_->readTimeoutMillis, &core_time::getMillis);
}

i32 SerialPort::readInteger() const {
	return serial_detail::readIntegerFrom(*this, body_->readTimeoutMillis, &core_time::getMillis);
}

f32 SerialPort::readFloat() const {
	return serial_detail::readFloatFrom(*this, body_->readTimeoutMillis, &core_time::getMillis);
}

void SerialPort::setReadTimeout(u32 milliseconds) const {
	body_->readTimeoutMillis = milliseconds;
}

u32 SerialPort::getReadTimeout() const {
	return body_->readTimeoutMillis;
}

void SerialPort::send(nullable<u8> value) const {
	if (value.isNull) {
		body_->handle->print("null");
	} else {
		body_->handle->print(value.value);
	}
}

void SerialPort::send(nullable<char> value) const {
	if (value.isNull) {
		body_->handle->print("null");
	} else {
		body_->handle->print(value.value);
	}
}

void SerialPort::send(nullable<core_string::String> value) const {
	if (value.isNull) {
		body_->handle->print("null");
	} else {
		body_->handle->print(value.value.c_str());
	}
}

void SerialPort::sendLine(nullable<u8> value) const {
	if (value.isNull) {
		body_->handle->println("null");
	} else {
		body_->handle->println(value.value);
	}
}

void SerialPort::sendLine(nullable<char> value) const {
	if (value.isNull) {
		body_->handle->println("null");
	} else {
		body_->handle->println(value.value);
	}
}

void SerialPort::sendLine(nullable<core_string::String> value) const {
	if (value.isNull) {
		body_->handle->println("null");
	} else {
		body_->handle->println(value.value.c_str());
	}
}

} // namespace core_serial
