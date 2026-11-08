#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_tim.h"
#include "stm32f1xx_ll_utils.h"

#include "../gpio/core_gpio.h"
#include "../time/core_time.h"
#include "core_software_serial_hardware.h"

namespace core_software_serial_hardware {

namespace software_serial_detail {

// Shared receive buffer and 3x-oversampled receive state machine. This
// fragment is self-contained (only the platform integer typedefs) so the host
// runtime test can compile and exercise it without any STM32 register. The
// generated driver injects it once inside its translation unit.

const u8 DATA_BIT_COUNT = 8;
const u8 OVERSAMPLE_FACTOR = 3;
// The timer fires OVERSAMPLE_FACTOR times per bit, so waiting one bit plus one
// extra tick after the start edge lands the first sample in the middle of the
// first data bit instead of on the edge itself.
const u8 START_CENTERING_TICKS = OVERSAMPLE_FACTOR + 1;
const u8 RECEIVE_CAPACITY = 64;
const u8 NO_PIN = 0xFF;
const i8 WAITING_START_BIT_INDEX = -1;
const i8 STOP_BIT_INDEX = DATA_BIT_COUNT;
const u8 MOST_SIGNIFICANT_BIT = 0x80;
const u8 TICK_WAITING_FOR_START = 1;

struct ReceiveBuffer {
	volatile u8 storage[RECEIVE_CAPACITY];
	volatile u8 head;
	volatile u8 tail;
	volatile u8 count;
	volatile boolean overflowed;
};

struct ReceiveState {
	volatile i16 tickCountdown;
	volatile i8 bitIndex;
	volatile u8 value;
};

void resetReceiveBuffer(volatile ReceiveBuffer &buffer) {
	buffer.head = 0;
	buffer.tail = 0;
	buffer.count = 0;
	buffer.overflowed = false;
}

void storeByte(volatile ReceiveBuffer &buffer, u8 value) {
	if (buffer.count == RECEIVE_CAPACITY) {
		buffer.head = (u8)((buffer.head + 1) % RECEIVE_CAPACITY);
		buffer.count--;
		buffer.overflowed = true;
	}
	buffer.storage[buffer.tail] = value;
	buffer.tail = (u8)((buffer.tail + 1) % RECEIVE_CAPACITY);
	buffer.count++;
}

boolean hasBufferedByte(const volatile ReceiveBuffer &buffer) {
	return buffer.count > 0;
}

u8 readBufferedByte(volatile ReceiveBuffer &buffer) {
	if (buffer.count == 0) {
		return 0;
	}
	const u8 value = buffer.storage[buffer.head];
	buffer.head = (u8)((buffer.head + 1) % RECEIVE_CAPACITY);
	buffer.count--;
	return value;
}

u8 peekBufferedByte(const volatile ReceiveBuffer &buffer) {
	if (buffer.count == 0) {
		return 0;
	}
	return buffer.storage[buffer.head];
}

boolean hasOverflowed(const volatile ReceiveBuffer &buffer) {
	return buffer.overflowed;
}

void resetReceiveState(volatile ReceiveState &state) {
	state.tickCountdown = TICK_WAITING_FOR_START;
	state.bitIndex = WAITING_START_BIT_INDEX;
	state.value = 0;
}

// Runs one timer tick. The update interrupt fires OVERSAMPLE_FACTOR times per
// bit, so this function discards ticks until the countdown reaches zero and
// only then samples the line. A low start bit begins a frame; each data bit is
// shifted in least significant first; a high stop bit commits the byte and a
// low stop bit discards the malformed frame.
void processReceiveTick(
	volatile ReceiveState &state,
	volatile ReceiveBuffer &buffer,
	boolean lineHigh) {
	state.tickCountdown--;
	if (state.tickCountdown > 0) {
		return;
	}

	if (state.bitIndex == WAITING_START_BIT_INDEX) {
		if (lineHigh) {
			state.tickCountdown = TICK_WAITING_FOR_START;
			return;
		}
		state.bitIndex = 0;
		state.value = 0;
		state.tickCountdown = START_CENTERING_TICKS;
		return;
	}

	if (state.bitIndex >= STOP_BIT_INDEX) {
		if (lineHigh) {
			storeByte(buffer, state.value);
		}
		state.bitIndex = WAITING_START_BIT_INDEX;
		state.tickCountdown = TICK_WAITING_FOR_START;
		return;
	}

	state.value >>= 1;
	if (lineHigh) {
		state.value |= MOST_SIGNIFICANT_BIT;
	}
	state.bitIndex++;
	state.tickCountdown = OVERSAMPLE_FACTOR;
}

} // namespace software_serial_detail

namespace software_serial_detail {

// Adapts the receive ring buffer to the shared `serial_detail` stream helpers.
// Each read takes the driver's critical section, so the timer interrupt cannot
// change the buffer between the empty check and the byte removal.
struct BufferedReceivePort {
	boolean hasData() const {
		return core_software_serial_hardware::hasBufferedData();
	}

	nullable<u8> read() const {
		nullable<u8> result;
		result.isNull = !core_software_serial_hardware::hasBufferedData();
		result.value = result.isNull ? 0 : core_software_serial_hardware::readBufferedByte();
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

namespace software_serial_detail {

// TIM4 lives on APB1, but the F1 clock tree doubles the APB1 timer clock when
// the APB1 prescaler is not 1, so at 72 MHz system clock TIM4 counts at 72 MHz.
const u32 TIMER_CLOCK = 72000000;
const u32 MAXIMUM_COUNTER_PERIOD = 65536;
const u32 MINIMUM_BAUD_RATE = 300;
const u32 MAXIMUM_BAUD_RATE = 115200;
const u8 RECEIVE_TIMER_IRQ_PRIORITY = 1;

struct TimerDivision {
	u16 prescaler;
	u16 autoReload;
};

volatile ReceiveBuffer receiveBuffer;
volatile ReceiveState receiveState;
volatile u8 activeReceivePin = NO_PIN;
u32 transmitBitCyclesByPin[PIN_COUNT];
u32 receiveBaudRateByPin[PIN_COUNT];

u32 saveAndDisableInterrupts() {
	const u32 savedState = __get_PRIMASK();
	__disable_irq();
	return savedState;
}

void restoreInterruptState(u32 savedState) {
	__set_PRIMASK(savedState);
}

u32 readCycleCount() {
	CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
	DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
	return DWT->CYCCNT;
}

void waitCycles(u32 cycles) {
	const u32 startCycles = readCycleCount();
	while ((u32)(DWT->CYCCNT - startCycles) < cycles) {
	}
}

TimerDivision computeTimerDivision(u32 baudRate) {
	const u32 ticksPerBit = TIMER_CLOCK / ((u32)baudRate * OVERSAMPLE_FACTOR);
	const u32 prescaler =
		(ticksPerBit + MAXIMUM_COUNTER_PERIOD - 1) / MAXIMUM_COUNTER_PERIOD;
	const u32 ticks = ticksPerBit / prescaler;
	const TimerDivision division = {
		(u16)(prescaler - 1),
		(u16)(ticks - 1),
	};
	return division;
}

void configureReceiveTimer(u32 baudRate) {
	const TimerDivision division = computeTimerDivision(baudRate);

	LL_APB1_GRP1_EnableClock(LL_APB1_GRP1_PERIPH_TIM4);
	LL_TIM_DisableCounter(TIM4);
	LL_TIM_SetCounterMode(TIM4, LL_TIM_COUNTERMODE_UP);
	LL_TIM_SetPrescaler(TIM4, division.prescaler);
	LL_TIM_SetAutoReload(TIM4, division.autoReload);
	LL_TIM_SetCounter(TIM4, 0);
	LL_TIM_GenerateEvent_UPDATE(TIM4);
	LL_TIM_ClearFlag_UPDATE(TIM4);
}

void enableReceiveTimer() {
	NVIC_SetPriority(TIM4_IRQn, RECEIVE_TIMER_IRQ_PRIORITY);
	NVIC_EnableIRQ(TIM4_IRQn);
	LL_TIM_ClearFlag_UPDATE(TIM4);
	LL_TIM_EnableIT_UPDATE(TIM4);
	LL_TIM_EnableCounter(TIM4);
}

void disableReceiveTimer() {
	LL_TIM_DisableCounter(TIM4);
	LL_TIM_DisableIT_UPDATE(TIM4);
	NVIC_DisableIRQ(TIM4_IRQn);
	LL_TIM_ClearFlag_UPDATE(TIM4);
}

void releaseReceiveTimer() {
	disableReceiveTimer();
	LL_APB1_GRP1_DisableClock(LL_APB1_GRP1_PERIPH_TIM4);
}

void resetReceive() {
	resetReceiveBuffer(receiveBuffer);
	resetReceiveState(receiveState);
}

void configureTransmitPin(core_gpio::Pin pin) {
	core_gpio::setMode(pin, core_gpio::OUTPUT);
	core_gpio::setDigital(pin, core_gpio::HIGH);
}

void releaseTransmitPin(core_gpio::Pin pin) {
	core_gpio::setDigital(pin, core_gpio::LOW);
	core_gpio::setMode(pin, core_gpio::INPUT);
}

void writeTransmitLevel(core_gpio::Pin pin, boolean high) {
	core_gpio::setDigital(pin, high ? core_gpio::HIGH : core_gpio::LOW);
}

void handleReceiveTick() {
	if (activeReceivePin == NO_PIN) {
		return;
	}
	const boolean lineHigh =
		core_gpio::getDigital((core_gpio::Pin)activeReceivePin) == core_gpio::HIGH;
	processReceiveTick(receiveState, receiveBuffer, lineHigh);
}

} // namespace software_serial_detail

u8 getReceiveCapacity() {
	return software_serial_detail::RECEIVE_CAPACITY;
}

boolean isBaudRateSupported(u32 baudRate) {
	return baudRate >= software_serial_detail::MINIMUM_BAUD_RATE &&
		   baudRate <= software_serial_detail::MAXIMUM_BAUD_RATE;
}

boolean isReceivePin(core_gpio::Pin pin) {
	return (u8)pin < PIN_COUNT;
}

u8 getPinChangeGroup(core_gpio::Pin pin) {
	// The STM32 receiver is driven by the TIM4 update interrupt, not by the AVR
	// pin-change groups, so no group exists for any pin.
	(void)pin;
	return software_serial_detail::NO_PIN;
}

u8 getPinChangeBit(core_gpio::Pin pin) {
	(void)pin;
	return software_serial_detail::NO_PIN;
}

boolean openPort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin, u32 baudRate) {
	if (!isBaudRateSupported(baudRate)) {
		return false;
	}

	const boolean hasTransmitPin = (u8)transmitPin < PIN_COUNT;
	const boolean hasReceivePin = isReceivePin(receivePin);

	if (!hasTransmitPin && !hasReceivePin) {
		return false;
	}

	if (hasTransmitPin) {
		software_serial_detail::transmitBitCyclesByPin[(u8)transmitPin] =
			software_serial_detail::TIMER_CLOCK / baudRate;
		software_serial_detail::configureTransmitPin(transmitPin);
	}

	if (hasReceivePin) {
		software_serial_detail::receiveBaudRateByPin[(u8)receivePin] = baudRate;
		core_gpio::setMode(receivePin, core_gpio::INPUT_PULLUP);
	}

	return true;
}

void closePort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	const u8 transmitNumber = (u8)transmitPin;

	if (transmitNumber < PIN_COUNT &&
		software_serial_detail::transmitBitCyclesByPin[transmitNumber] != 0) {
		software_serial_detail::releaseTransmitPin(transmitPin);
		software_serial_detail::transmitBitCyclesByPin[transmitNumber] = 0;
	}

	if (!isReceivePin(receivePin)) {
		return;
	}

	const u8 receiveNumber = (u8)receivePin;
	const boolean ownsReceiveLine =
		software_serial_detail::activeReceivePin == receiveNumber;
	const boolean receiverInitialized =
		software_serial_detail::receiveBaudRateByPin[receiveNumber] != 0;

	software_serial_detail::receiveBaudRateByPin[receiveNumber] = 0;

	if (!ownsReceiveLine) {
		// Another pin owns the single receive timer, so only this handle's
		// registration is released. With nobody listening, a handle that had
		// initialized the receiver still has to release the timer it started.
		if (software_serial_detail::activeReceivePin != software_serial_detail::NO_PIN) {
			return;
		}
		if (!receiverInitialized) {
			return;
		}
	} else {
		stopReceive(receivePin);
	}

	software_serial_detail::resetReceive();
	software_serial_detail::releaseReceiveTimer();
}

void startReceive(core_gpio::Pin receivePin) {
	if (!isReceivePin(receivePin)) {
		return;
	}

	const u8 receiveNumber = (u8)receivePin;
	const u32 baudRate =
		software_serial_detail::receiveBaudRateByPin[receiveNumber];

	if (baudRate == 0) {
		return;
	}

	if (software_serial_detail::activeReceivePin == receiveNumber) {
		software_serial_detail::resetReceive();
		software_serial_detail::configureReceiveTimer(baudRate);
		software_serial_detail::enableReceiveTimer();
		return;
	}

	software_serial_detail::disableReceiveTimer();
	software_serial_detail::activeReceivePin = receiveNumber;
	software_serial_detail::configureReceiveTimer(baudRate);
	software_serial_detail::resetReceive();
	software_serial_detail::enableReceiveTimer();
}

void stopReceive(core_gpio::Pin receivePin) {
	if (software_serial_detail::activeReceivePin != (u8)receivePin) {
		return;
	}
	software_serial_detail::disableReceiveTimer();
	software_serial_detail::activeReceivePin = software_serial_detail::NO_PIN;
}

boolean isReceiving(core_gpio::Pin receivePin) {
	return software_serial_detail::activeReceivePin == (u8)receivePin;
}

void sendByte(core_gpio::Pin transmitPin, u8 value) {
	const u8 transmitNumber = (u8)transmitPin;

	if (transmitNumber >= PIN_COUNT) {
		return;
	}

	const u32 bitCycles =
		software_serial_detail::transmitBitCyclesByPin[transmitNumber];

	if (bitCycles == 0) {
		return;
	}

	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();

	software_serial_detail::writeTransmitLevel(transmitPin, false);
	software_serial_detail::waitCycles(bitCycles);

	for (u8 index = 0; index < software_serial_detail::DATA_BIT_COUNT; index++) {
		software_serial_detail::writeTransmitLevel(
			transmitPin, (boolean)((value & (u8)(1 << index)) != 0));
		software_serial_detail::waitCycles(bitCycles);
	}

	software_serial_detail::writeTransmitLevel(transmitPin, true);
	software_serial_detail::restoreInterruptState(savedState);
	software_serial_detail::waitCycles(bitCycles);
}

boolean hasBufferedData() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result =
		software_serial_detail::hasBufferedByte(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

u8 readBufferedByte() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const u8 value =
		software_serial_detail::readBufferedByte(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

u8 peekBufferedByte() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const u8 value =
		software_serial_detail::peekBufferedByte(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

boolean hasReceiveOverflow() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result =
		software_serial_detail::hasOverflowed(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

void storeReceivedByte(u8 value) {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	software_serial_detail::storeByte(software_serial_detail::receiveBuffer, value);
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

extern "C" void TIM4_IRQHandler(void) {
	if (LL_TIM_IsActiveFlag_UPDATE(TIM4) == 0) {
		return;
	}
	LL_TIM_ClearFlag_UPDATE(TIM4);
	core_software_serial_hardware::software_serial_detail::handleReceiveTick();
}
