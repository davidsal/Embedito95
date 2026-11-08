// Host compile and behaviour guard for the whole generated AVR engine serial
// translation unit (arduino-nano/snapshots/engine/serial/core_serial.cpp). The
// generated `.cpp` is included verbatim against the AVR-like stand-ins, so
// constness violations such as mutating `SerialPortBody` fields from a `const`
// method fail here instead of only on device. Compiling the shared `.inc` in
// isolation is not enough: the class body is what carries the `const`
// qualifiers.
//
// `getSerial` reads the global `Serial`, so the host must define one before the
// generated header is pulled in.

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <Arduino.h>

HardwareSerial Serial;

#include "../src/arduino-nano/snapshots/engine/serial/core_serial.cpp"

static const u8 PEEKED_FIRST_BYTE = 'A';
static const u8 PEEKED_SECOND_BYTE = 'B';
static const u32 DEFAULT_READ_TIMEOUT_MILLIS = 1000;
static const u32 ZERO_READ_TIMEOUT_MILLIS = 0;
static const u32 SHORT_READ_TIMEOUT_MILLIS = 50;
static const u32 CLOCK_OVERSHOOT_STEPS = 2;
static const f32 EXPECTED_FLOAT_VALUE = 1500.0f;
static const char EXPECTED_TERMINATED_TEXT[] = "a";
static const char EXPECTED_LINE_TEXT[] = "line";

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                        \
			failures++;                                                              \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);              \
		}                                                                          \
	} while (0)

static core_serial::SerialPort getPort() {
	return core_serial::getSerial(core_serial::Serial::SERIAL_1);
}

static void scenarioEmptyStreamDoesNotConsume() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	port.initialize(9600);

	CHECK(port.peekByte().isNull);
	CHECK(port.read().isNull);
	CHECK(port.hasData() == false);
}

static void scenarioRepeatedPeekKeepsTheSameByte() {
	Serial.resetBuffers();
	Serial.feed(PEEKED_FIRST_BYTE);
	Serial.feed(PEEKED_SECOND_BYTE);
	core_serial::SerialPort port = getPort();

	const nullable<u8> first = port.peekByte();
	const nullable<u8> second = port.peekByte();
	CHECK(!first.isNull && first.value == PEEKED_FIRST_BYTE);
	CHECK(!second.isNull && second.value == PEEKED_FIRST_BYTE);

	const nullable<u8> consumed = port.read();
	const nullable<u8> next = port.read();
	CHECK(!consumed.isNull && consumed.value == PEEKED_FIRST_BYTE);
	CHECK(!next.isNull && next.value == PEEKED_SECOND_BYTE);
	CHECK(port.read().isNull);
}

static void scenarioReadBlockConsumesThePeekedByte() {
	Serial.resetBuffers();
	Serial.feed(PEEKED_FIRST_BYTE);
	Serial.feed(PEEKED_SECOND_BYTE);
	core_serial::SerialPort port = getPort();

	const nullable<u8> peeked = port.peekByte();
	CHECK(!peeked.isNull && peeked.value == PEEKED_FIRST_BYTE);

	const core_array::Array<u8> block = port.readBlock(2);
	CHECK(block.length() == 2);
	CHECK(block[0] == PEEKED_FIRST_BYTE);
	CHECK(block[1] == PEEKED_SECOND_BYTE);
}

static void scenarioSendBufferPreservesOrder() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	const u16 writeSpace = port.getWriteSpace();
	CHECK(writeSpace == (u16)Serial.availableForWrite());

	core_array::Array<u8> payload;
	payload.push(7);
	payload.push(8);
	payload.push(9);
	port.sendBuffer(payload);

	CHECK(Serial.writtenLength() == 3);
	CHECK(Serial.writtenByteAt(0) == 7);
	CHECK(Serial.writtenByteAt(1) == 8);
	CHECK(Serial.writtenByteAt(2) == 9);
}

static void scenarioZeroMaximumBlocksDoNotWait() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	const core_array::Array<u8> block = port.readBlock(0);
	const core_array::Array<u8> until = port.readBlockUntil(10, 0);
	CHECK(block.length() == 0);
	CHECK(until.length() == 0);
}

static void scenarioDefaultReadTimeoutIsOneSecond() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	CHECK(port.getReadTimeout() == (u32)core_serial::serial_detail::READ_TIMEOUT_MILLIS);
	CHECK(port.getReadTimeout() == DEFAULT_READ_TIMEOUT_MILLIS);
}

static void scenarioZeroReadTimeoutDoesNotBlockCharacterReads() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	port.setReadTimeout(ZERO_READ_TIMEOUT_MILLIS);

	Serial.feed('a');
	Serial.feed('b');
	Serial.feed('c');
	const core_string::String text = port.readText();
	CHECK(text.length() == 3);
	CHECK(text[0] == 'a');
	CHECK(text[2] == 'c');

	Serial.resetBuffers();
	Serial.feed('x');
	Serial.feed('X');
	Serial.feed('Y');
	Serial.feed('Z');
	CHECK(port.findText(core_string::String("XYZ")));
	CHECK(port.read().isNull);

	Serial.resetBuffers();
	Serial.feed('l');
	Serial.feed('i');
	Serial.feed('n');
	Serial.feed('e');
	Serial.feed('\n');
	Serial.feed('r');
	const core_string::String line = port.readLine();
	CHECK(line.length() == 4);
	CHECK(Serial.available() == 1);

	Serial.resetBuffers();
	Serial.feed('4');
	Serial.feed('2');
	CHECK(port.readInteger() == 42);

	Serial.resetBuffers();
	Serial.feed('1');
	Serial.feed('.');
	Serial.feed('5');
	Serial.feed('e');
	Serial.feed('3');
	CHECK(port.readFloat() == EXPECTED_FLOAT_VALUE);
}

static void scenarioZeroReadTimeoutDrainsBufferedBlock() {
	Serial.resetBuffers();
	Serial.feed('a');
	Serial.feed('b');
	Serial.feed('c');
	core_serial::SerialPort port = getPort();
	port.setReadTimeout(ZERO_READ_TIMEOUT_MILLIS);

	const core_array::Array<u8> block = port.readBlock(5);
	CHECK(block.length() == 3);
	CHECK(block[0] == 'a');
	CHECK(block[2] == 'c');
	CHECK(port.read().isNull);

	const core_array::Array<u8> emptyBlock = port.readBlockUntil('\n', 5);
	CHECK(emptyBlock.length() == 0);
}

static void scenarioReadTextUntilLeavesFollowingByteUnconsumed() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	port.setReadTimeout(ZERO_READ_TIMEOUT_MILLIS);
	Serial.feed('a');
	Serial.feed(';');
	Serial.feed('b');
	Serial.feed('c');

	const core_string::String text = port.readTextUntil(';');
	CHECK(strcmp(text.c_str(), EXPECTED_TERMINATED_TEXT) == 0);

	const nullable<u8> next = port.read();
	CHECK(!next.isNull && next.value == 'b');
}

static void scenarioReadLineMatchesReadTextUntilNewline() {
	Serial.resetBuffers();
	core_serial::SerialPort linePort = getPort();
	linePort.setReadTimeout(ZERO_READ_TIMEOUT_MILLIS);
	Serial.feed('l');
	Serial.feed('i');
	Serial.feed('n');
	Serial.feed('e');
	Serial.feed('\n');
	Serial.feed('r');
	Serial.feed('e');
	Serial.feed('s');
	Serial.feed('t');
	const core_string::String line = linePort.readLine();

	Serial.resetBuffers();
	core_serial::SerialPort textPort = getPort();
	textPort.setReadTimeout(ZERO_READ_TIMEOUT_MILLIS);
	Serial.feed('l');
	Serial.feed('i');
	Serial.feed('n');
	Serial.feed('e');
	Serial.feed('\n');
	Serial.feed('r');
	Serial.feed('e');
	Serial.feed('s');
	Serial.feed('t');
	const core_string::String text = textPort.readTextUntil('\n');

	CHECK(strcmp(line.c_str(), text.c_str()) == 0);
	CHECK(strcmp(line.c_str(), EXPECTED_LINE_TEXT) == 0);
}

static void scenarioReadTextUntilWithZeroTimeoutOnEmptyStreamReturnsEmpty() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	port.setReadTimeout(ZERO_READ_TIMEOUT_MILLIS);

	const core_string::String text = port.readTextUntil('\n');
	CHECK(text.length() == 0);
}

static void scenarioShortReadTimeoutIsRespected() {
	Serial.resetBuffers();
	core_serial::SerialPort port = getPort();
	port.setReadTimeout(SHORT_READ_TIMEOUT_MILLIS);
	core_time::resetHostClockMillis();

	const core_string::String text = port.readText();
	CHECK(text.length() == 0);
	const u32 elapsedMillis = core_time::peekHostClockMillis();
	CHECK(elapsedMillis >= SHORT_READ_TIMEOUT_MILLIS);
	CHECK(
		elapsedMillis <=
		SHORT_READ_TIMEOUT_MILLIS + (u32)core_time::HOST_CLOCK_STEP_MILLIS * CLOCK_OVERSHOOT_STEPS);
}

int main() {
	scenarioEmptyStreamDoesNotConsume();
	scenarioRepeatedPeekKeepsTheSameByte();
	scenarioReadBlockConsumesThePeekedByte();
	scenarioSendBufferPreservesOrder();
	scenarioZeroMaximumBlocksDoNotWait();
	scenarioDefaultReadTimeoutIsOneSecond();
	scenarioZeroReadTimeoutDoesNotBlockCharacterReads();
	scenarioZeroReadTimeoutDrainsBufferedBlock();
	scenarioReadTextUntilLeavesFollowingByteUnconsumed();
	scenarioReadLineMatchesReadTextUntilNewline();
	scenarioReadTextUntilWithZeroTimeoutOnEmptyStreamReturnsEmpty();
	scenarioShortReadTimeoutIsRespected();

	if (failures == 0) {
		printf("Serial AVR engine: generated engine compiles and runs\n");
		return 0;
	}
	printf("Serial AVR engine: %d check(s) failed\n", failures);
	return 1;
}
