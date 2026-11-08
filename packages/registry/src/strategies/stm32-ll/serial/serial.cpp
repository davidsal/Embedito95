#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_usart.h"
#include "core_serial.h"
#include "../gpio/core_gpio.h"

namespace core_serial {

_e95_replace_serialCommon

SerialPort::SerialPort(USART_TypeDef *handle) {
	this->body_ = core_mem::Ref<SerialPortBody>::emplace();
	this->body_->handle = handle;
	this->body_->hasPendingByte = false;
	this->body_->pendingByte = 0;
	this->body_->readTimeoutMillis = serial_detail::READ_TIMEOUT_MILLIS;
}

static const u8 _e95_INT64_MAX_DIGITS = 20;

typedef struct {
	USART_TypeDef *usart;
	core_gpio::Pin tx;
	core_gpio::Pin rx;
	u32 clock;
} SerialConfig;

static const SerialConfig _e95_SERIAL_CONFIGS[] = {
_e95_replace_serialConfigs
};

static const SerialConfig *_e95_findSerialConfig(USART_TypeDef *serial) {
	for (const SerialConfig &config : _e95_SERIAL_CONFIGS) {
		if (config.usart == serial) {
			return &config;
		}
	}
	return nullptr;
}

static void _e95_enableSerialClock(USART_TypeDef *serial) {
	_e95_replace_serialClocks
}

static void _e95_transmit(USART_TypeDef *serial, u8 data) {
	while (!LL_USART_IsActiveFlag_TXE(serial));
	LL_USART_TransmitData8(serial, data);
}

static void _e95_transmitDecimalMagnitude(USART_TypeDef *serial, u64 magnitude) {
	char buffer[_e95_INT64_MAX_DIGITS];
	u8 length = 0;

	do {
		buffer[length] = (char)('0' + magnitude % serial_detail::DECIMAL_BASE);
		length++;
		magnitude /= serial_detail::DECIMAL_BASE;
	} while (magnitude > 0);

	while (length > 0) {
		length--;
		_e95_transmit(serial, (u8)buffer[length]);
	}
}

static void _e95_transmitSignedDecimal(USART_TypeDef *serial, i64 value) {
	u64 magnitude;

	if (value < 0) {
		_e95_transmit(serial, (u8)serial_detail::MINUS_SIGN_CHARACTER);
		magnitude = (u64)(-(value + 1)) + 1;
	} else {
		magnitude = (u64)value;
	}

	_e95_transmitDecimalMagnitude(serial, magnitude);
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
	result.isNull = !LL_USART_IsActiveFlag_RXNE(body_->handle);
	result.value = result.isNull ? 0 : LL_USART_ReceiveData8(body_->handle);
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
	return serial_detail::NO_WRITE_BUFFER_SPACE;
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
		_e95_transmit(body_->handle, data[index]);
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

void SerialPort::close() const {
	LL_USART_Disable(body_->handle);
}

void SerialPort::flushOutput() const {
	while (!LL_USART_IsActiveFlag_TC(body_->handle)) {
	}
}

void SerialPort::initialize(u32 baudRate) const {
	const SerialConfig *config = _e95_findSerialConfig(body_->handle);
	if (!config) {
		return;
	}

	_e95_enableSerialClock(body_->handle);

	core_gpio::_e95_setPinAlternate(config->tx);
	core_gpio::setMode(config->rx, core_gpio::INPUT_PULLUP);

	LL_USART_SetBaudRate(body_->handle, config->clock, baudRate);
	LL_USART_SetDataWidth(body_->handle, LL_USART_DATAWIDTH_8B);
	LL_USART_SetStopBitsLength(body_->handle, LL_USART_STOPBITS_1);
	LL_USART_SetParity(body_->handle, LL_USART_PARITY_NONE);
	LL_USART_SetTransferDirection(body_->handle, LL_USART_DIRECTION_TX_RX);
	LL_USART_Enable(body_->handle);
}

void SerialPort::send(const char *data) const {
	while (*data) {
		_e95_transmit(body_->handle, (u8)*data);
		data++;
	}
}

void SerialPort::send(const core_string::String &data) const {
	send(data.c_str());
}

void SerialPort::send(char value) const {
	_e95_transmit(body_->handle, (u8)value);
}

void SerialPort::send(u8 value) const {
	_e95_transmitDecimalMagnitude(body_->handle, (u64)value);
}

void SerialPort::send(i8 value) const {
	_e95_transmitSignedDecimal(body_->handle, (i64)value);
}

void SerialPort::send(u16 value) const {
	_e95_transmitDecimalMagnitude(body_->handle, (u64)value);
}

void SerialPort::send(i16 value) const {
	_e95_transmitSignedDecimal(body_->handle, (i64)value);
}

void SerialPort::send(u32 value) const {
	_e95_transmitDecimalMagnitude(body_->handle, (u64)value);
}

void SerialPort::send(i32 value) const {
	_e95_transmitSignedDecimal(body_->handle, (i64)value);
}

void SerialPort::send(int value) const {
	send((i32)value);
}

void SerialPort::send(u64 value) const {
	_e95_transmitDecimalMagnitude(body_->handle, value);
}

void SerialPort::send(i64 value) const {
	_e95_transmitSignedDecimal(body_->handle, value);
}

void SerialPort::send(f32 value) const {
	const core_string::String text(value);
	send(text.c_str());
}

void SerialPort::send(f64 value) const {
	const core_string::String text(value);
	send(text.c_str());
}

void SerialPort::sendLine(const char *data) const {
	send(data);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(const core_string::String &data) const {
	sendLine(data.c_str());
}

void SerialPort::sendLine(char value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(u8 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(i8 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(u16 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(i16 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(u32 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(i32 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(int value) const {
	sendLine((i32)value);
}

void SerialPort::sendLine(u64 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(i64 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(f32 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(f64 value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::send(nullable<u8> value) const {
	if (value.isNull) {
		send("null");
	} else {
		send(value.value);
	}
}

void SerialPort::send(nullable<char> value) const {
	if (value.isNull) {
		send("null");
	} else {
		send(value.value);
	}
}

void SerialPort::send(nullable<core_string::String> value) const {
	if (value.isNull) {
		send("null");
	} else {
		send(value.value);
	}
}

void SerialPort::sendLine(nullable<u8> value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(nullable<char> value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

void SerialPort::sendLine(nullable<core_string::String> value) const {
	send(value);
	_e95_transmit(body_->handle, (u8)serial_detail::NEWLINE_CHARACTER);
}

_e95_replace_getSerial

} // namespace core_serial
