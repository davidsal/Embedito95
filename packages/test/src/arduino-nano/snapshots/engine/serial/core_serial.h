#ifndef _e95_SERIAL_H
#define _e95_SERIAL_H

#include <Arduino.h>
#include <core_array.h>
#include <core_string.h>
#include <core_memory.h>
#include <core_time.h>

namespace core_serial {

struct SerialPortBody {
	HardwareSerial *handle;
	mutable bool hasPendingByte;
	mutable u8 pendingByte;
	mutable u32 readTimeoutMillis;
};

class SerialPort {
public:
	SerialPort() : body_() {}

	SerialPort(HardwareSerial &handle);

	void initialize(u32 baudRate) const {
		body_->handle->begin(baudRate);
	}

	void close() const {
		body_->handle->end();
	}

	void flushOutput() const {
		body_->handle->flush();
	}

	void send(const char *data) const {
		body_->handle->print(data);
	}

	void send(const __FlashStringHelper *data) const {
		body_->handle->print(data);
	}

	void send(const core_string::String &data) const {
		body_->handle->print(data.c_str());
	}

	void send(char value) const {
		body_->handle->print(value);
	}

	void send(u8 value) const {
		body_->handle->print(value);
	}

	void send(i8 value) const {
		body_->handle->print((int)value);
	}

	void send(u16 value) const {
		body_->handle->print(value);
	}

	void send(i16 value) const {
		body_->handle->print(value);
	}

	void send(u32 value) const {
		body_->handle->print(value);
	}

	void send(i32 value) const {
		body_->handle->print(value);
	}

	void send(u64 value) const {
		body_->handle->print(core_string::String(value).c_str());
	}

	void send(i64 value) const {
		body_->handle->print(core_string::String(value).c_str());
	}

	void send(f32 value) const {
		body_->handle->print(core_string::String(value).c_str());
	}

	void send(f64 value) const {
		body_->handle->print(core_string::String(value).c_str());
	}

	void sendLine(const char *data) const {
		body_->handle->println(data);
	}

	void sendLine(const __FlashStringHelper *data) const {
		body_->handle->println(data);
	}

	void sendLine(const core_string::String &data) const {
		body_->handle->println(data.c_str());
	}

	void sendLine(char value) const {
		body_->handle->println(value);
	}

	void sendLine(u8 value) const {
		body_->handle->println(value);
	}

	void sendLine(i8 value) const {
		body_->handle->println((int)value);
	}

	void sendLine(u16 value) const {
		body_->handle->println(value);
	}

	void sendLine(i16 value) const {
		body_->handle->println(value);
	}

	void sendLine(u32 value) const {
		body_->handle->println(value);
	}

	void sendLine(i32 value) const {
		body_->handle->println(value);
	}

	void sendLine(u64 value) const {
		body_->handle->println(core_string::String(value).c_str());
	}

	void sendLine(i64 value) const {
		body_->handle->println(core_string::String(value).c_str());
	}

	void sendLine(f32 value) const {
		body_->handle->println(core_string::String(value).c_str());
	}

	void sendLine(f64 value) const {
		body_->handle->println(core_string::String(value).c_str());
	}

	void send(nullable<u8> value) const;
	void send(nullable<char> value) const;
	void send(nullable<core_string::String> value) const;
	void sendLine(nullable<u8> value) const;
	void sendLine(nullable<char> value) const;
	void sendLine(nullable<core_string::String> value) const;

	nullable<u8> read() const;
	nullable<u8> peekByte() const;
	u16 getWriteSpace() const;
	core_array::Array<u8> readBlock(u16 maximum) const;
	core_array::Array<u8> readBlockUntil(u8 terminator, u16 maximum) const;
	void sendBuffer(const core_array::Array<u8> &data) const;
	core_string::String readLine() const;
	core_string::String readTextUntil(char terminator) const;
	core_string::String readText() const;
	bool findText(const core_string::String &needle) const;
	bool findTextUntil(const core_string::String &needle, char terminator) const;
	i32 readInteger() const;
	f32 readFloat() const;
	void setReadTimeout(u32 milliseconds) const;
	u32 getReadTimeout() const;

	boolean hasData() const {
		return body_->hasPendingByte || body_->handle->available() > 0;
	}

	inline bool operator==(const SerialPort &other) const {
		if (!body_.hasValue() && !other.body_.hasValue()) {
			return true;
		}
		if (!body_.hasValue() || !other.body_.hasValue()) {
			return false;
		}
		return body_->handle == other.body_->handle;
	}

	inline bool operator!=(const SerialPort &other) const {
		return !(*this == other);
	}

private:
	core_mem::Ref<SerialPortBody> body_;
};

typedef enum : u8 {
	SERIAL_1 = 1
} Serial;


inline SerialPort getSerial(Serial selector) {
	switch (selector) {
		case Serial::SERIAL_1: {
			static SerialPort port(::Serial);
			return port;
		}
		default:
			return SerialPort();
	}
}

} // namespace core_serial

#endif
