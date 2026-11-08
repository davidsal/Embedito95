#include <avr/interrupt.h>
#include <avr/io.h>
#include <util/delay_basic.h>

#include <core_time.h>

#include "core_software_serial_hardware.h"

namespace core_software_serial_hardware {

namespace software_serial_detail {

const u8 DATA_BIT_COUNT = 8;
const u8 LAST_PIN = 19;
const u8 PIN_COUNT = LAST_PIN + 1;
const u8 PIN_CHANGE_GROUP_COUNT = 3;
const u8 PIN_CHANGE_GROUP_B = 0;
const u8 PIN_CHANGE_GROUP_C = 1;
const u8 PIN_CHANGE_GROUP_D = 2;
const u8 PIN_CHANGE_NONE = 0xFF;
const u8 NO_PIN = 0xFF;
const u8 LAST_PORT_D_PIN = 7;
const u8 LAST_PORT_B_PIN = 13;
const u8 FIRST_PORT_B_PIN = 8;
const u8 FIRST_PORT_C_PIN = 14;
const u8 MOST_SIGNIFICANT_BIT = (u8)(1 << (DATA_BIT_COUNT - 1));

const u32 CYCLES_PER_SECOND = F_CPU;
const u32 BIT_DELAY_CYCLE_DIVISOR = 4;
// 300 baud is the lowest supported rate for sampling accuracy. The 16-bit loop
// counter itself would only overflow below about 61 baud
// (16000000 / (4 * 65535)); the floor is not a counter limit.
const u32 MINIMUM_BAUD_RATE = 300;
// At 57600 baud the half-bit centering delay keeps a margin above the fixed
// interrupt overhead. At 115200 only 17 loop units remain for the half bit, so
// centering saturates at one loop and the first sample depends on the assumed
// overhead; that rate is deliberately rejected.
const u32 MAXIMUM_BAUD_RATE = 57600;

// The interrupt entry, the pin sample and the loop control add a fixed number
// of cycles before each sample. The values follow the AVR code generation used
// by the Arduino toolchain; dividing them by BIT_DELAY_CYCLE_DIVISOR converts
// them to `_delay_loop_2` units (four cycles per iteration). The integer
// division truncates, so the subtractCap helper saturates the result at one
// loop instead of letting it wrap.
//
// Transmit path: the digital write that drives the start/data/stop level runs
// between two loop iterations.
const u16 TX_DIGITAL_WRITE_CYCLES = 15;
// Receive path: interrupt vector dispatch plus the register saves before the
// centering delay starts.
const u16 RX_INTERRUPT_ENTRY_CYCLES = 4;
// First `_delay_loop_2` iteration setup for the centering delay.
const u16 RX_CENTERING_LOOP_BODY_CYCLES = 4;
// ISR prologue (register pushes, mask save, port lookup) before the sample.
const u16 RX_ISR_PROLOGUE_CYCLES = 75;
// Reading PINx and testing the receive bit for the start/data sample.
const u16 RX_PIN_SAMPLE_CYCLES = 17;
// Loop-control cycles already counted by the surrounding delay iterations.
const u16 RX_LOOP_CONTROL_CYCLES = 23;
// Each data-bit `_delay_loop_2` iteration plus its loop control.
const u16 RX_DATA_LOOP_BODY_CYCLES = 23;
// Stop-bit `_delay_loop_2` iterations plus the loop control.
const u16 RX_STOP_LOOP_BODY_CYCLES = 37;
// Stop-bit pin sample and the branch that decides whether to store the byte.
const u16 RX_STOP_SAMPLE_CYCLES = 11;

const u16 TX_OVERHEAD_LOOP_UNITS =
	(TX_DIGITAL_WRITE_CYCLES / BIT_DELAY_CYCLE_DIVISOR);
const u16 RX_CENTERING_OVERHEAD_LOOP_UNITS =
	((RX_INTERRUPT_ENTRY_CYCLES + RX_CENTERING_LOOP_BODY_CYCLES +
	  RX_ISR_PROLOGUE_CYCLES + RX_PIN_SAMPLE_CYCLES -
	  RX_LOOP_CONTROL_CYCLES) /
	 BIT_DELAY_CYCLE_DIVISOR);
const u16 RX_BIT_OVERHEAD_LOOP_UNITS =
	(RX_DATA_LOOP_BODY_CYCLES / BIT_DELAY_CYCLE_DIVISOR);
const u16 RX_STOP_OVERHEAD_LOOP_UNITS =
	((RX_STOP_LOOP_BODY_CYCLES + RX_STOP_SAMPLE_CYCLES) /
	 BIT_DELAY_CYCLE_DIVISOR);
const u16 CENTERING_DIVISOR = 2;
const u16 STOP_DIVISOR_NUMERATOR = 3;
const u16 STOP_DIVISOR = 4;

struct PortRegisters {
	volatile u8 *input;
	volatile u8 *output;
	volatile u8 *direction;
};

const PortRegisters PORT_D = { &PIND, &PORTD, &DDRD };
const PortRegisters PORT_B = { &PINB, &PORTB, &DDRB };
const PortRegisters PORT_C = { &PINC, &PORTC, &DDRC };

volatile u8 *const PIN_CHANGE_MASK_REGISTERS[PIN_CHANGE_GROUP_COUNT] = {
	&PCMSK0,
	&PCMSK1,
	&PCMSK2,
};
const u8 PIN_CHANGE_ENABLE_BITS[PIN_CHANGE_GROUP_COUNT] = {
	PCIE0,
	PCIE1,
	PCIE2,
};

// Bit timing is stored per pin so two handles with different baud rates can
// transmit independently, and opening a second handle does not overwrite the
// timing of the active receiver.
u16 bitDelayByPin[PIN_COUNT];

volatile u8 activeReceivePin = NO_PIN;
volatile u16 receiveCenteringDelay = 0;
volatile u16 receiveBitDelay = 0;
volatile u16 receiveStopDelay = 0;

volatile u8 receiveBuffer[RECEIVE_CAPACITY];
volatile u8 receiveHead = 0;
volatile u8 receiveTail = 0;
volatile u8 receiveCount = 0;
volatile boolean receiveOverflowed = false;

const PortRegisters *resolvePort(core_gpio::Pin pin) {
	const u8 number = (u8)pin;

	if (number <= LAST_PORT_D_PIN) {
		return &PORT_D;
	}
	if (number <= LAST_PORT_B_PIN) {
		return &PORT_B;
	}
	if (number <= LAST_PIN) {
		return &PORT_C;
	}
	return nullptr;
}

u8 resolvePinBit(core_gpio::Pin pin) {
	const u8 number = (u8)pin;

	if (number <= LAST_PORT_D_PIN) {
		return number;
	}
	if (number <= LAST_PORT_B_PIN) {
		return (u8)(number - FIRST_PORT_B_PIN);
	}
	return (u8)(number - FIRST_PORT_C_PIN);
}

u8 resolveBitMask(core_gpio::Pin pin) {
	return (u8)_BV(resolvePinBit(pin));
}

u8 resolvePinChangeGroup(core_gpio::Pin pin) {
	const u8 number = (u8)pin;

	if (number <= LAST_PORT_D_PIN) {
		return PIN_CHANGE_GROUP_D;
	}
	if (number <= LAST_PORT_B_PIN) {
		return PIN_CHANGE_GROUP_B;
	}
	if (number <= LAST_PIN) {
		return PIN_CHANGE_GROUP_C;
	}
	return PIN_CHANGE_NONE;
}

u8 resolvePinChangeBit(core_gpio::Pin pin) {
	return resolvePinBit(pin);
}

u16 subtractCap(u16 value, u16 subtrahend) {
	if (value > subtrahend) {
		return (u16)(value - subtrahend);
	}
	return 1;
}

void configureReceiveTiming(u16 bitDelay) {
	receiveCenteringDelay =
		subtractCap((u16)(bitDelay / CENTERING_DIVISOR),
					RX_CENTERING_OVERHEAD_LOOP_UNITS);
	receiveBitDelay = subtractCap(bitDelay, RX_BIT_OVERHEAD_LOOP_UNITS);
	receiveStopDelay =
		subtractCap((u16)((bitDelay * STOP_DIVISOR_NUMERATOR) / STOP_DIVISOR),
					RX_STOP_OVERHEAD_LOOP_UNITS);
}

u16 resolveBitDelayLoops(u32 baudRate) {
	if (baudRate < MINIMUM_BAUD_RATE || baudRate > MAXIMUM_BAUD_RATE) {
		return 0;
	}
	return (u16)((CYCLES_PER_SECOND / baudRate) / BIT_DELAY_CYCLE_DIVISOR);
}

u8 saveAndDisableInterrupts() {
	const u8 savedState = SREG;
	cli();
	return savedState;
}

void restoreInterruptState(u8 savedState) {
	SREG = savedState;
}

void resetReceiveBuffer() {
	const u8 savedState = saveAndDisableInterrupts();
	receiveHead = 0;
	receiveTail = 0;
	receiveCount = 0;
	receiveOverflowed = false;
	restoreInterruptState(savedState);
}

void setReceiveMask(boolean enabled) {
	const u8 group = resolvePinChangeGroup((core_gpio::Pin)activeReceivePin);

	if (group == PIN_CHANGE_NONE) {
		return;
	}

	const u8 bit = resolvePinChangeBit((core_gpio::Pin)activeReceivePin);
	const u8 mask = (u8)_BV(bit);

	if (enabled) {
		*PIN_CHANGE_MASK_REGISTERS[group] |= mask;
	} else {
		*PIN_CHANGE_MASK_REGISTERS[group] &= (u8)~mask;
	}
}

void releaseReceive() {
	if (activeReceivePin == NO_PIN) {
		return;
	}
	setReceiveMask(false);
	activeReceivePin = NO_PIN;
}

void configureTransmit(core_gpio::Pin pin) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);
	*port->output |= mask;
	*port->direction |= mask;
}

void releaseTransmit(core_gpio::Pin pin) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);
	*port->direction &= (u8)~mask;
	*port->output &= (u8)~mask;
}

void configureReceive(core_gpio::Pin pin) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);
	*port->direction &= (u8)~mask;
	*port->output |= mask;
}
void handlePinChangeInterrupt(u8 group) {
	if (activeReceivePin == NO_PIN) {
		return;
	}
	if (resolvePinChangeGroup((core_gpio::Pin)activeReceivePin) != group) {
		return;
	}

	const PortRegisters *port = resolvePort((core_gpio::Pin)activeReceivePin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask((core_gpio::Pin)activeReceivePin);

	// A pin-change interrupt also fires on rising edges and on other pins of
	// the same port; only a low start bit belongs to a frame.
	if ((*port->input & mask) != 0) {
		return;
	}

	setReceiveMask(false);
	_delay_loop_2(receiveCenteringDelay);

	u8 value = 0;
	for (u8 index = 0; index < DATA_BIT_COUNT; index++) {
		_delay_loop_2(receiveBitDelay);
		value >>= 1;
		if ((*port->input & mask) != 0) {
			value |= MOST_SIGNIFICANT_BIT;
		}
	}

	_delay_loop_2(receiveStopDelay);

	// A low stop bit means the frame is malformed (framing error); discard it
	// instead of injecting a corrupted byte into the stream.
	if ((*port->input & mask) != 0) {
		storeReceivedByte(value);
	}

	PCIFR = (u8)_BV(group);
	setReceiveMask(true);
}
void writeTransmitLevel(core_gpio::Pin pin, boolean high) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);

	if (high) {
		*port->output |= mask;
	} else {
		*port->output &= (u8)~mask;
	}
}

void transmitByte(core_gpio::Pin pin, u8 value) {
	const u8 number = (u8)pin;

	if (number > LAST_PIN) {
		return;
	}

	const u16 bitDelay = bitDelayByPin[number];

	if (bitDelay == 0) {
		return;
	}

	const u16 transmitDelay = subtractCap(bitDelay, TX_OVERHEAD_LOOP_UNITS);
	const u8 savedInterruptState = saveAndDisableInterrupts();

	writeTransmitLevel(pin, false);
	_delay_loop_2(transmitDelay);

	for (u8 index = 0; index < DATA_BIT_COUNT; index++) {
		writeTransmitLevel(pin, (boolean)((value & (u8)_BV(index)) != 0));
		_delay_loop_2(transmitDelay);
	}

	writeTransmitLevel(pin, true);
	restoreInterruptState(savedInterruptState);
	_delay_loop_2(transmitDelay);
}
struct BufferedReceivePort {
	boolean hasData() const {
		return hasBufferedData();
	}

	nullable<u8> read() const {
		nullable<u8> result;
		result.isNull = !hasBufferedData();
		result.value = result.isNull ? 0 : readBufferedByte();
		return result;
	}
};

} // namespace software_serial_detail

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

u8 getReceiveCapacity() {
	return RECEIVE_CAPACITY;
}

boolean isBaudRateSupported(u32 baudRate) {
	return software_serial_detail::resolveBitDelayLoops(baudRate) != 0;
}

boolean isReceivePin(core_gpio::Pin pin) {
	return (u8)pin < software_serial_detail::PIN_COUNT;
}

u8 getPinChangeGroup(core_gpio::Pin pin) {
	if (!isReceivePin(pin)) {
		return software_serial_detail::PIN_CHANGE_NONE;
	}
	return software_serial_detail::resolvePinChangeGroup(pin);
}

u8 getPinChangeBit(core_gpio::Pin pin) {
	if (!isReceivePin(pin)) {
		return software_serial_detail::PIN_CHANGE_NONE;
	}
	return software_serial_detail::resolvePinChangeBit(pin);
}

boolean openPort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin, u32 baudRate) {
	const u16 bitDelay = software_serial_detail::resolveBitDelayLoops(baudRate);
	const boolean hasTransmitPin =
		(u8)transmitPin < software_serial_detail::PIN_COUNT;
	const boolean hasReceivePin = isReceivePin(receivePin);

	if (bitDelay == 0 || (!hasTransmitPin && !hasReceivePin)) {
		return false;
	}

	if (hasTransmitPin) {
		software_serial_detail::bitDelayByPin[(u8)transmitPin] = bitDelay;
		software_serial_detail::configureTransmit(transmitPin);
	}

	if (hasReceivePin) {
		software_serial_detail::bitDelayByPin[(u8)receivePin] = bitDelay;
		software_serial_detail::configureReceive(receivePin);
	}

	return true;
}

void closePort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	const u8 transmitNumber = (u8)transmitPin;
	const u8 receiveNumber = (u8)receivePin;

	if (transmitNumber < software_serial_detail::PIN_COUNT &&
		software_serial_detail::bitDelayByPin[transmitNumber] != 0) {
		software_serial_detail::releaseTransmit(transmitPin);
		software_serial_detail::bitDelayByPin[transmitNumber] = 0;
	}

	if (!isReceivePin(receivePin)) {
		return;
	}

	if (software_serial_detail::activeReceivePin == receiveNumber) {
		software_serial_detail::releaseReceive();
		software_serial_detail::resetReceiveBuffer();
	}

	// The receive timing is stored per pin, and another handle may still own
	// the same receive pin, so closing one handle does not clear it. `initialize`
	// always rewrites the timing before a handle starts listening again.
}

void startReceive(core_gpio::Pin receivePin) {
	if (!isReceivePin(receivePin)) {
		return;
	}

	const u8 receiveNumber = (u8)receivePin;
	const u16 bitDelay = software_serial_detail::bitDelayByPin[receiveNumber];

	if (bitDelay == 0) {
		return;
	}

	const u8 group = software_serial_detail::resolvePinChangeGroup(receivePin);
	const u8 enableBit =
		software_serial_detail::PIN_CHANGE_ENABLE_BITS[group];

	if (software_serial_detail::activeReceivePin == receiveNumber) {
		software_serial_detail::resetReceiveBuffer();
		software_serial_detail::configureReceiveTiming(bitDelay);
		PCIFR = (u8)_BV(group);
		software_serial_detail::setReceiveMask(true);
		return;
	}

	software_serial_detail::releaseReceive();
	software_serial_detail::activeReceivePin = receiveNumber;
	software_serial_detail::configureReceiveTiming(bitDelay);
	software_serial_detail::resetReceiveBuffer();

	PCICR |= (u8)_BV(enableBit);
	PCIFR = (u8)_BV(group);
	software_serial_detail::setReceiveMask(true);
}

void stopReceive(core_gpio::Pin receivePin) {
	if (software_serial_detail::activeReceivePin != (u8)receivePin) {
		return;
	}
	software_serial_detail::releaseReceive();
}

boolean isReceiving(core_gpio::Pin receivePin) {
	return software_serial_detail::activeReceivePin == (u8)receivePin;
}

void sendByte(core_gpio::Pin transmitPin, u8 value) {
	software_serial_detail::transmitByte(transmitPin, value);
}

boolean hasBufferedData() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result = software_serial_detail::receiveCount > 0;
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

u8 readBufferedByte() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();

	if (software_serial_detail::receiveCount == 0) {
		software_serial_detail::restoreInterruptState(savedState);
		return 0;
	}

	const u8 value =
		software_serial_detail::receiveBuffer[software_serial_detail::receiveHead];
	software_serial_detail::receiveHead =
		(u8)((software_serial_detail::receiveHead + 1) % RECEIVE_CAPACITY);
	software_serial_detail::receiveCount--;
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

u8 peekBufferedByte() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();

	if (software_serial_detail::receiveCount == 0) {
		software_serial_detail::restoreInterruptState(savedState);
		return 0;
	}

	const u8 value =
		software_serial_detail::receiveBuffer[software_serial_detail::receiveHead];
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

boolean hasReceiveOverflow() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result = software_serial_detail::receiveOverflowed;
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

void storeReceivedByte(u8 value) {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();

	if (software_serial_detail::receiveCount == RECEIVE_CAPACITY) {
		software_serial_detail::receiveHead =
			(u8)((software_serial_detail::receiveHead + 1) % RECEIVE_CAPACITY);
		software_serial_detail::receiveCount--;
		software_serial_detail::receiveOverflowed = true;
	}

	software_serial_detail::receiveBuffer[software_serial_detail::receiveTail] = value;
	software_serial_detail::receiveTail =
		(u8)((software_serial_detail::receiveTail + 1) % RECEIVE_CAPACITY);
	software_serial_detail::receiveCount++;
	software_serial_detail::restoreInterruptState(savedState);
}

core_string::String readStreamLine() {
	software_serial_detail::BufferedReceivePort port;
	core_string::String line;
	serial_detail::readLineInto(
		port,
		line,
		serial_detail::READ_TIMEOUT_MILLIS,
		&core_time::getMillis,
		serial_detail::NEWLINE_CHARACTER);
	return line;
}

i32 readStreamInteger() {
	software_serial_detail::BufferedReceivePort port;
	return serial_detail::readIntegerFrom(
		port,
		serial_detail::READ_TIMEOUT_MILLIS,
		&core_time::getMillis);
}

} // namespace core_software_serial_hardware

ISR(PCINT0_vect) {
	core_software_serial_hardware::software_serial_detail::handlePinChangeInterrupt(
		core_software_serial_hardware::software_serial_detail::PIN_CHANGE_GROUP_B);
}

ISR(PCINT1_vect) {
	core_software_serial_hardware::software_serial_detail::handlePinChangeInterrupt(
		core_software_serial_hardware::software_serial_detail::PIN_CHANGE_GROUP_C);
}

ISR(PCINT2_vect) {
	core_software_serial_hardware::software_serial_detail::handlePinChangeInterrupt(
		core_software_serial_hardware::software_serial_detail::PIN_CHANGE_GROUP_D);
}
