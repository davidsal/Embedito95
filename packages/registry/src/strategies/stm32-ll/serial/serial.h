#ifndef _e95_SERIAL_H
#define _e95_SERIAL_H

#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_usart.h"
#include "../type/core_array.h"
#include "../type/core_string.h"
#include "../system/core_memory.h"
#include "../time/core_time.h"

namespace core_serial {

struct SerialPortBody {
	USART_TypeDef *handle;
	mutable bool hasPendingByte;
	mutable u8 pendingByte;
	mutable u32 readTimeoutMillis;
};

class SerialPort {
public:
	SerialPort() : body_() {}

	SerialPort(USART_TypeDef *handle);

	void initialize(u32 baudRate) const;
	void close() const;
	void flushOutput() const;
	void send(const char *data) const;
	void send(const core_string::String &data) const;
	void send(char value) const;
	void send(u8 value) const;
	void send(i8 value) const;
	void send(u16 value) const;
	void send(i16 value) const;
	void send(u32 value) const;
	void send(i32 value) const;
	void send(int value) const;
	void send(u64 value) const;
	void send(i64 value) const;
	void send(f32 value) const;
	void send(f64 value) const;
	void sendLine(const char *data) const;
	void sendLine(const core_string::String &data) const;
	void sendLine(char value) const;
	void sendLine(u8 value) const;
	void sendLine(i8 value) const;
	void sendLine(u16 value) const;
	void sendLine(i16 value) const;
	void sendLine(u32 value) const;
	void sendLine(i32 value) const;
	void sendLine(int value) const;
	void sendLine(u64 value) const;
	void sendLine(i64 value) const;
	void sendLine(f32 value) const;
	void sendLine(f64 value) const;
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
		return body_->hasPendingByte || LL_USART_IsActiveFlag_RXNE(body_->handle) != 0;
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

_e95_replace_serialSupport

} // namespace core_serial

#endif
