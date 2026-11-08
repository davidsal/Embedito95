#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_usart.h"
#include "core_serial.h"
#include "../gpio/core_gpio.h"

namespace core_serial {

// Shared serial stream helpers, platform-agnostic.
// Single source of truth, inlined into each platform's core_serial.cpp through
// the `_e95_replace_serialCommon` marker. It is self-contained (only
// `<stdint.h>` types) so the host can compile and exercise it directly in
// runtime-tests/serial-read.test.cpp against a fake byte source.
//
// The helpers receive the owning port through a template parameter. Any port
// qualifies as long as it exposes:
//   - `hasData()`      -> true when a byte is waiting
//   - `read()`         -> a nullable-like box with `isNull` and `value` members
// and the platform passes a `currentMillis()` function for the timeout.

namespace serial_detail {

// Initial wait budget for every blocking read. The platform ports copy it into
// their per-port configuration and the software-serial stream uses it directly,
// so the default lives here only.
const uint32_t READ_TIMEOUT_MILLIS = 1000;
const uint8_t DECIMAL_BASE = 10;
const uint8_t DIGIT_ZERO_CHARACTER = '0';
const uint8_t DIGIT_NINE_CHARACTER = '9';
const uint8_t MINUS_SIGN_CHARACTER = '-';
const uint8_t PLUS_SIGN_CHARACTER = '+';
const uint8_t DECIMAL_POINT_CHARACTER = '.';
const uint8_t EXPONENT_LOWER_CHARACTER = 'e';
const uint8_t EXPONENT_UPPER_CHARACTER = 'E';
const char NEWLINE_CHARACTER = '\n';
const int32_t INT32_MAX_VALUE = 2147483647;
const int32_t MAX_FLOAT_EXPONENT = 38;
const float DECIMAL_TEN = 10.0f;
const float DECIMAL_TENTH = 0.1f;
const uint16_t NO_WRITE_BUFFER_SPACE = 0;
const uint16_t EMPTY_LENGTH = 0;
const uint8_t NO_TERMINATOR = 0;
const uint32_t NO_WAIT_TIMEOUT_MILLIS = 0;

typedef uint32_t (*CurrentMillis)();

// Waits up to `timeoutMillis` for a byte to arrive. Uses the caller clock so
// the whole file stays free of any platform timing call.
template <typename PortType>
bool waitForByte(const PortType &port, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	const uint32_t startMillis = currentMillis();
	while (!port.hasData()) {
		if ((uint32_t)(currentMillis() - startMillis) >= timeoutMillis) {
			return false;
		}
	}
	return true;
}

// Caches the next byte in `pendingByte` so repeated peeks observe the same
// value without pulling another byte from the source. The caller must serve
// that cached byte from its read path before touching the source again.
template <typename PortType>
bool peekByteInto(const PortType &port, bool &hasPendingByte, uint8_t &pendingByte) {
	if (hasPendingByte) {
		return true;
	}
	if (!port.hasData()) {
		return false;
	}
	const auto data = port.read();
	if (data.isNull) {
		return false;
	}
	pendingByte = (uint8_t)data.value;
	hasPendingByte = true;
	return true;
}

// Reports whether a byte can be collected now. A byte already sitting in the
// source is taken without consulting the clock, so buffered data is never
// dropped because the deadline elapsed. `timeoutMillis == 0` means "only what
// is already available": it never waits for a new byte.
template <typename PortType>
bool waitForAvailableByte(const PortType &port, uint32_t startMillis, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	if (port.hasData()) {
		return true;
	}
	if (timeoutMillis == NO_WAIT_TIMEOUT_MILLIS) {
		return false;
	}
	const uint32_t elapsedMillis = (uint32_t)(currentMillis() - startMillis);
	if (elapsedMillis >= timeoutMillis) {
		return false;
	}
	return waitForByte(port, timeoutMillis - elapsedMillis, currentMillis);
}

// Collects up to `maximum` bytes into `buffer`, stopping early when the
// terminator arrives (and dropping it) or when the overall deadline expires.
// Bytes already available are always consumed, so `timeoutMillis == 0` drains
// the buffered data without waiting for more. `maximum == 0` returns
// immediately without polling the clock. Returns the number of bytes appended.
template <typename PortType, typename BufferType>
uint16_t collectBlock(const PortType &port, BufferType &buffer, uint16_t maximum, uint32_t timeoutMillis, CurrentMillis currentMillis, uint8_t terminator, bool stopsAtTerminator) {
	if (maximum == EMPTY_LENGTH) {
		return 0;
	}

	const uint32_t startMillis = currentMillis();
	uint16_t collected = 0;
	while (collected < maximum) {
		if (!waitForAvailableByte(port, startMillis, timeoutMillis, currentMillis)) {
			break;
		}
		const auto data = port.read();
		if (data.isNull) {
			break;
		}
		if (stopsAtTerminator && (uint8_t)data.value == terminator) {
			break;
		}
		buffer.push(data.value);
		collected++;
	}
	return collected;
}

// Reads up to `maximum` bytes, giving up at the overall deadline. Bytes already
// buffered are consumed even with `timeoutMillis == 0`. The received bytes are
// appended to `buffer`.
template <typename PortType, typename BufferType>
uint16_t readBlockInto(const PortType &port, BufferType &buffer, uint16_t maximum, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	return collectBlock(port, buffer, maximum, timeoutMillis, currentMillis, NO_TERMINATOR, false);
}

// Reads up to `maximum` bytes, stopping at `terminator` (which is dropped).
// The received bytes are appended to `buffer`.
template <typename PortType, typename BufferType>
uint16_t readBlockUntilInto(const PortType &port, BufferType &buffer, uint8_t terminator, uint16_t maximum, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	return collectBlock(port, buffer, maximum, timeoutMillis, currentMillis, terminator, true);
}

// Collects characters into `text` until a read times out, optionally stopping
// at `terminator` (which is dropped). Returns the number of characters
// appended.
template <typename PortType, typename TextType>
uint16_t readCharactersInto(const PortType &port, TextType &text, uint32_t timeoutMillis, CurrentMillis currentMillis, uint8_t terminator, bool stopsAtTerminator) {
	uint16_t length = 0;
	while (waitForByte(port, timeoutMillis, currentMillis)) {
		const auto data = port.read();
		if (data.isNull) {
			break;
		}
		if (stopsAtTerminator && (uint8_t)data.value == terminator) {
			break;
		}
		text.push((char)data.value);
		length++;
	}
	return length;
}

// Collects characters into `line` until the terminator arrives or a read times
// out. Returns the number of characters appended (the terminator is dropped).
template <typename PortType, typename LineType>
uint16_t readLineInto(const PortType &port, LineType &line, uint32_t timeoutMillis, CurrentMillis currentMillis, char terminator) {
	return readCharactersInto(port, line, timeoutMillis, currentMillis, (uint8_t)terminator, true);
}

// Collects characters into `text` until a read times out, with no terminator.
// Returns the number of characters appended.
template <typename PortType, typename TextType>
uint16_t readTextInto(const PortType &port, TextType &text, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	return readCharactersInto(port, text, timeoutMillis, currentMillis, NO_TERMINATOR, false);
}

// Returns the length of the longest proper prefix of `needle[0..length)` that
// is also its suffix, used to resume a search after a mismatch. Recomputed from
// the needle itself so the search needs no heap or stack table.
inline uint16_t computeFailureLength(const char *needle, uint16_t length) {
	for (uint16_t candidate = (uint16_t)(length - 1); candidate > 0; candidate--) {
		bool isMatch = true;
		for (uint16_t index = 0; index < candidate; index++) {
			if (needle[index] != needle[length - candidate + index]) {
				isMatch = false;
				break;
			}
		}
		if (isMatch) {
			return candidate;
		}
	}
	return 0;
}

// Consumes bytes until `needle` arrives (its last byte is consumed) or a read
// times out, optionally stopping at `terminator` (which is dropped). On a
// mismatch the search resumes at the longest prefix that is also a suffix, so
// overlapping patterns are still found. Returns true when the needle arrived.
template <typename PortType>
bool findTextUntilInto(const PortType &port, const char *needle, uint16_t needleLength, uint8_t terminator, bool stopsAtTerminator, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	if (needleLength == EMPTY_LENGTH) {
		return true;
	}

	uint16_t matchedLength = 0;
	while (waitForByte(port, timeoutMillis, currentMillis)) {
		const auto data = port.read();
		if (data.isNull) {
			break;
		}
		const char character = (char)data.value;
		if (stopsAtTerminator && (uint8_t)character == terminator) {
			break;
		}
		while (matchedLength > 0 && needle[matchedLength] != character) {
			matchedLength = computeFailureLength(needle, matchedLength);
		}
		if (needle[matchedLength] == character) {
			matchedLength++;
			if (matchedLength == needleLength) {
				return true;
			}
		}
	}
	return false;
}

// Consumes bytes until `needle` arrives (its last byte is consumed) or a read
// times out. Returns true when the needle arrived.
template <typename PortType>
bool findTextInto(const PortType &port, const char *needle, uint16_t needleLength, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	return findTextUntilInto(port, needle, needleLength, NO_TERMINATOR, false, timeoutMillis, currentMillis);
}

// Parses the first decimal integer in the stream, skipping any leading
// non-numeric bytes. Returns 0 when no digit arrives before the timeout and
// clamps to the signed 32-bit range on overflow.
template <typename PortType>
int32_t readIntegerFrom(const PortType &port, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	bool isNegative = false;
	bool hasDigit = false;
	int32_t value = 0;

	while (waitForByte(port, timeoutMillis, currentMillis)) {
		const auto data = port.read();
		if (data.isNull) {
			break;
		}
		const uint8_t character = (uint8_t)data.value;
		if (!hasDigit && character == MINUS_SIGN_CHARACTER) {
			isNegative = true;
			continue;
		}
		if (!hasDigit && character == PLUS_SIGN_CHARACTER) {
			continue;
		}
		if (character >= DIGIT_ZERO_CHARACTER && character <= DIGIT_NINE_CHARACTER) {
			hasDigit = true;
			const int32_t digit = (int32_t)(character - DIGIT_ZERO_CHARACTER);
			if (value > (INT32_MAX_VALUE - digit) / (int32_t)DECIMAL_BASE) {
				value = INT32_MAX_VALUE;
			} else {
				value = value * (int32_t)DECIMAL_BASE + digit;
			}
			continue;
		}
		if (hasDigit) {
			break;
		}
	}

	return isNegative ? -value : value;
}

// Parses the first floating-point number in the stream, skipping any leading
// non-numeric bytes. Accepts an optional sign, a decimal point and a decimal
// exponent. Returns 0 when no digit arrives before the timeout.
template <typename PortType>
float readFloatFrom(const PortType &port, uint32_t timeoutMillis, CurrentMillis currentMillis) {
	bool isNegative = false;
	bool hasDigit = false;
	bool isFractional = false;
	bool hasExponent = false;
	bool isExponentNegative = false;
	bool hasExponentDigit = false;
	float value = 0;
	float fractionScale = 1;
	int32_t exponent = 0;

	while (waitForByte(port, timeoutMillis, currentMillis)) {
		const auto data = port.read();
		if (data.isNull) {
			break;
		}
		const uint8_t character = (uint8_t)data.value;
		if (!hasDigit && !isFractional && character == MINUS_SIGN_CHARACTER) {
			isNegative = true;
			continue;
		}
		if (!hasDigit && !isFractional && character == PLUS_SIGN_CHARACTER) {
			continue;
		}
		if (character >= DIGIT_ZERO_CHARACTER && character <= DIGIT_NINE_CHARACTER) {
			hasDigit = true;
			const int32_t digit = (int32_t)(character - DIGIT_ZERO_CHARACTER);
			if (hasExponent) {
				hasExponentDigit = true;
				if (exponent < MAX_FLOAT_EXPONENT) {
					exponent = exponent * (int32_t)DECIMAL_BASE + digit;
				}
				continue;
			}
			if (isFractional) {
				fractionScale = fractionScale * DECIMAL_TENTH;
				value = value + (float)digit * fractionScale;
				continue;
			}
			value = value * DECIMAL_TEN + (float)digit;
			continue;
		}
		if (!hasExponent && character == DECIMAL_POINT_CHARACTER && !isFractional) {
			isFractional = true;
			continue;
		}
		if (hasDigit && !hasExponent && (character == EXPONENT_LOWER_CHARACTER || character == EXPONENT_UPPER_CHARACTER)) {
			hasExponent = true;
			continue;
		}
		if (hasExponent && !hasExponentDigit && character == MINUS_SIGN_CHARACTER) {
			isExponentNegative = true;
			continue;
		}
		if (hasExponent && !hasExponentDigit && character == PLUS_SIGN_CHARACTER) {
			continue;
		}
		if (hasDigit) {
			break;
		}
	}

	if (!hasDigit) {
		return 0;
	}

	const float signedValue = isNegative ? -value : value;
	if (!hasExponentDigit) {
		return signedValue;
	}

	float result = signedValue;
	int32_t remainingExponent = exponent;
	while (remainingExponent > 0) {
		result = isExponentNegative ? result / DECIMAL_TEN : result * DECIMAL_TEN;
		remainingExponent--;
	}
	return result;
}

} // namespace serial_detail

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
	{ USART1, core_gpio::Pin::PIN_A9, core_gpio::Pin::PIN_A10, 72000000 },
	{ USART2, core_gpio::Pin::PIN_A2, core_gpio::Pin::PIN_A3, 72000000 },
	{ USART3, core_gpio::Pin::PIN_B10, core_gpio::Pin::PIN_B11, 72000000 },
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
		if (serial == USART1) { LL_APB2_GRP1_EnableClock(LL_APB2_GRP1_PERIPH_USART1); } else
	if (serial == USART2) { LL_APB1_GRP1_EnableClock(LL_APB1_GRP1_PERIPH_USART2); } else
	if (serial == USART3) { LL_APB1_GRP1_EnableClock(LL_APB1_GRP1_PERIPH_USART3); } else
	{ }
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

SerialPort getSerial(Serial selector) {
	switch (selector) {
		case Serial::SERIAL_1: {
			static SerialPort port(USART1);
			return port;
		}
		case Serial::SERIAL_2: {
			static SerialPort port(USART2);
			return port;
		}
		case Serial::SERIAL_3: {
			static SerialPort port(USART3);
			return port;
		}
		default:
			return SerialPort();
	}
}

} // namespace core_serial
