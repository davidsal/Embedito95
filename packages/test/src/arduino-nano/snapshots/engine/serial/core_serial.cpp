#include <Arduino.h>
#include "core_serial.h"

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
