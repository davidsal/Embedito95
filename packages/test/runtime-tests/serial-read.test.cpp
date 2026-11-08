// Host unit tests for the shared serial stream helpers
// (strategies/shared/serial/serial_common.inc). The helpers are inlined into
// every platform's core_serial.cpp; this test compiles the very same source on
// the host against a fake byte source and a fake clock, so the read/parse
// behaviour is validated before it reaches the device.
//
// The fake source models an empty queue whose clock advances on every poll, so
// a drained buffer exercises the timeout path exactly like a real serial line
// that has gone quiet.

#include <stdint.h>
#include <stdio.h>

namespace core_serial {
#include "packages/registry/src/strategies/shared/serial/serial_common.inc"
} // namespace core_serial

using core_serial::serial_detail::findTextInto;
using core_serial::serial_detail::findTextUntilInto;
using core_serial::serial_detail::peekByteInto;
using core_serial::serial_detail::readBlockInto;
using core_serial::serial_detail::readBlockUntilInto;
using core_serial::serial_detail::readFloatFrom;
using core_serial::serial_detail::readIntegerFrom;
using core_serial::serial_detail::readLineInto;
using core_serial::serial_detail::readTextInto;

struct FakeByte {
	bool isNull;
	uint8_t value;
};

static const uint8_t *g_bytes = nullptr;
static uint16_t g_byteCount = 0;
static uint16_t g_byteIndex = 0;
static uint32_t g_millis = 0;

struct FakePort {
	bool hasData() const {
		return g_byteIndex < g_byteCount;
	}

	FakeByte read() const {
		FakeByte box;
		if (g_byteIndex >= g_byteCount) {
			box.isNull = true;
			box.value = 0;
			return box;
		}
		box.isNull = false;
		box.value = g_bytes[g_byteIndex];
		g_byteIndex++;
		return box;
	}
};

// Models the owning port's caching path: a byte pulled by a peek is held in
// `pendingByte` and served by the next read before touching the source again.
// The fields are mutable because the read path is const, exactly like
// `SerialPortBody`.
struct PendingFakePort {
	mutable bool hasPendingByte;
	mutable uint8_t pendingByte;

	PendingFakePort() : hasPendingByte(false), pendingByte(0) {}

	bool hasData() const {
		return hasPendingByte || g_byteIndex < g_byteCount;
	}

	FakeByte read() const {
		if (hasPendingByte) {
			hasPendingByte = false;
			FakeByte pending;
			pending.isNull = false;
			pending.value = pendingByte;
			return pending;
		}
		FakeByte box;
		if (g_byteIndex >= g_byteCount) {
			box.isNull = true;
			box.value = 0;
			return box;
		}
		box.isNull = false;
		box.value = g_bytes[g_byteIndex];
		g_byteIndex++;
		return box;
	}
};

struct FakeLine {
	char text[64];
	uint16_t length;

	FakeLine() : length(0) {
		text[0] = '\0';
	}

	void push(char value) {
		if (length < 63) {
			text[length] = value;
			length++;
			text[length] = '\0';
		}
	}
};

struct FakeBuffer {
	uint8_t values[64];
	uint16_t length;

	FakeBuffer() : length(0) {}

	void push(uint8_t value) {
		if (length < 64) {
			values[length] = value;
			length++;
		}
	}
};

static const uint32_t CLOCK_STEP_MILLIS = 100;
static const uint32_t CLOCK_TIMEOUT_MILLIS = 1000;
static const uint32_t CLOCK_OVERSHOOT_TOLERANCE_MILLIS = CLOCK_STEP_MILLIS * 2;
static const uint32_t ZERO_TIMEOUT_MILLIS = 0;

static uint32_t fakeCurrentMillis() {
	g_millis += CLOCK_STEP_MILLIS;
	return g_millis;
}

static void resetSource(const char *text) {
	g_bytes = reinterpret_cast<const uint8_t *>(text);
	g_byteCount = 0;
	while (text[g_byteCount] != '\0') {
		g_byteCount++;
	}
	g_byteIndex = 0;
	g_millis = 0;
}

static int failures = 0;

#define CHECK(cond)                                                              \
	do {                                                                          \
		if (!(cond)) {                                                              \
			failures++;                                                               \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);                   \
		}                                                                           \
	} while (0)

static void scenarioReadLineStopsAtTerminator() {
	resetSource("hello\nworld");
	FakePort port;
	FakeLine line;
	readLineInto(port, line, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, '\n');
	CHECK(line.length == 5);
	CHECK(line.text[0] == 'h');
	CHECK(line.text[4] == 'o');
	CHECK(line.text[5] == '\0');
}

static void scenarioReadLineTimesOutOnQuietLine() {
	resetSource("");
	FakePort port;
	FakeLine line;
	readLineInto(port, line, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, '\n');
	CHECK(line.length == 0);
}

static void scenarioReadLineKeepsBytesWithoutTerminator() {
	resetSource("abc");
	FakePort port;
	FakeLine line;
	readLineInto(port, line, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, '\n');
	CHECK(line.length == 3);
	CHECK(line.text[0] == 'a');
	CHECK(line.text[2] == 'c');
}

static void scenarioReadTextUntilStopsAtCarriageReturn() {
	resetSource("hello\rworld");
	FakePort port;
	FakeLine text;
	const uint16_t collected =
		readLineInto(port, text, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, '\r');
	CHECK(collected == 5);
	CHECK(text.length == 5);
	CHECK(text.text[0] == 'h');
	CHECK(text.text[4] == 'o');
	CHECK(g_byteIndex == 6);
}

static void scenarioReadTextUntilDropsTrailingTerminatorAtStreamEnd() {
	resetSource("abc;");
	FakePort port;
	FakeLine text;
	const uint16_t collected =
		readLineInto(port, text, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, ';');
	CHECK(collected == 3);
	CHECK(text.length == 3);
	CHECK(text.text[0] == 'a');
	CHECK(text.text[2] == 'c');
	CHECK(g_byteIndex == 4);
}

static void scenarioReadTextUntilDropsOnlyTheFirstRepeatedTerminator() {
	resetSource("ab;;cd");
	FakePort port;
	FakeLine text;
	const uint16_t collected =
		readLineInto(port, text, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, ';');
	CHECK(collected == 2);
	CHECK(text.length == 2);
	CHECK(text.text[0] == 'a');
	CHECK(text.text[1] == 'b');
	CHECK(g_byteIndex == 3);
}

static void scenarioReadTextUntilKeepsBytesWithoutTerminator() {
	resetSource("abc");
	FakePort port;
	FakeLine text;
	const uint16_t collected =
		readLineInto(port, text, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, '\r');
	CHECK(collected == 3);
	CHECK(text.length == 3);
	CHECK(text.text[0] == 'a');
	CHECK(text.text[2] == 'c');
}

static void scenarioReadTextUntilOnEmptyStreamReturnsEmpty() {
	resetSource("");
	FakePort port;
	FakeLine text;
	const uint16_t collected =
		readLineInto(port, text, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis, '\r');
	CHECK(collected == 0);
	CHECK(text.length == 0);
}

static void scenarioReadIntegerParsesDigits() {
	resetSource("123");
	FakePort port;
	CHECK(readIntegerFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis) == 123);
}

static void scenarioReadIntegerParsesNegative() {
	resetSource("-45");
	FakePort port;
	CHECK(readIntegerFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis) == -45);
}

static void scenarioReadIntegerSkipsLeadingNoiseAndStops() {
	resetSource("abc-12x9");
	FakePort port;
	CHECK(readIntegerFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis) == -12);
}

static void scenarioReadIntegerReturnsZeroOnNoDigits() {
	resetSource("hello");
	FakePort port;
	CHECK(readIntegerFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis) == 0);
}

static void scenarioReadIntegerClampsOverflow() {
	resetSource("99999999999");
	FakePort port;
	const int32_t parsed =
		readIntegerFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(parsed == core_serial::serial_detail::INT32_MAX_VALUE);
}

static void scenarioReadIntegerAcceptsPlusSign() {
	resetSource("+7");
	FakePort port;
	CHECK(readIntegerFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis) == 7);
}

static void scenarioPeekKeepsTheSameByte() {
	resetSource("AB");
	FakePort port;
	bool hasPendingByte = false;
	uint8_t pendingByte = 0;
	CHECK(peekByteInto(port, hasPendingByte, pendingByte));
	CHECK(hasPendingByte);
	CHECK(pendingByte == 'A');
	CHECK(g_byteIndex == 1);
	CHECK(peekByteInto(port, hasPendingByte, pendingByte));
	CHECK(pendingByte == 'A');
	CHECK(g_byteIndex == 1);
}

static void scenarioPeekReportsEmptyLine() {
	resetSource("");
	FakePort port;
	bool hasPendingByte = false;
	uint8_t pendingByte = 0;
	CHECK(!peekByteInto(port, hasPendingByte, pendingByte));
	CHECK(!hasPendingByte);
}

static void scenarioReadBlockStopsAtMaximum() {
	resetSource("abcdef");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockInto(port, buffer, 3, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.length == 3);
	CHECK(buffer.values[0] == 'a');
	CHECK(buffer.values[1] == 'b');
	CHECK(buffer.values[2] == 'c');
}

static void scenarioReadBlockKeepsBytesUntilTimeout() {
	resetSource("ab");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockInto(port, buffer, 5, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 2);
	CHECK(buffer.length == 2);
	CHECK(buffer.values[0] == 'a');
	CHECK(buffer.values[1] == 'b');
}

static void scenarioReadBlockWithZeroMaximumDoesNotWait() {
	resetSource("abc");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockInto(port, buffer, 0, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 0);
	CHECK(buffer.length == 0);
	CHECK(g_millis == 0);
	CHECK(g_byteIndex == 0);
}

static void scenarioReadBlockWithZeroTimeoutConsumesBufferedBytes() {
	resetSource("abc");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockInto(port, buffer, 5, ZERO_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.length == 3);
	CHECK(buffer.values[0] == 'a');
	CHECK(buffer.values[2] == 'c');
	CHECK(g_byteIndex == 3);
}

static void scenarioReadBlockWithZeroTimeoutOnQuietLineReturnsEmpty() {
	resetSource("");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockInto(port, buffer, 5, ZERO_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 0);
	CHECK(buffer.length == 0);
	CHECK(g_byteIndex == 0);
}

static void scenarioReadBlockHonoursShortTimeoutAfterDrainingBuffer() {
	resetSource("abc");
	FakePort port;
	FakeBuffer buffer;
	const uint32_t shortTimeoutMillis = 300;
	const uint16_t collected =
		readBlockInto(port, buffer, 5, shortTimeoutMillis, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.length == 3);
	CHECK(g_byteIndex == 3);
	CHECK(g_millis <= shortTimeoutMillis + CLOCK_OVERSHOOT_TOLERANCE_MILLIS);
}

static void scenarioReadBlockUntilDropsTerminator() {
	resetSource("abc\ndef");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected = readBlockUntilInto(
		port, buffer, '\n', 10, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.length == 3);
	CHECK(buffer.values[0] == 'a');
	CHECK(buffer.values[1] == 'b');
	CHECK(buffer.values[2] == 'c');
	CHECK(g_byteIndex == 4);
}

static void scenarioReadBlockUntilStopsAtMaximum() {
	resetSource("abcdef\n");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected = readBlockUntilInto(
		port, buffer, '\n', 3, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.values[0] == 'a');
	CHECK(buffer.values[1] == 'b');
	CHECK(buffer.values[2] == 'c');
	CHECK(g_byteIndex == 3);
}

static void scenarioReadBlockUntilKeepsBytesWithoutTerminator() {
	resetSource("abc");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected = readBlockUntilInto(
		port, buffer, '\n', 10, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.values[0] == 'a');
	CHECK(buffer.values[2] == 'c');
}

static void scenarioReadBlockUntilWithZeroMaximumDoesNotWait() {
	resetSource("abc\n");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected = readBlockUntilInto(
		port, buffer, '\n', 0, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 0);
	CHECK(buffer.length == 0);
	CHECK(g_millis == 0);
}

static void scenarioReadBlockUntilWithZeroTimeoutDropsTerminator() {
	resetSource("abc\ndef");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockUntilInto(port, buffer, '\n', 10, ZERO_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.length == 3);
	CHECK(buffer.values[2] == 'c');
	CHECK(g_byteIndex == 4);
}

static void scenarioReadBlockUntilWithZeroTimeoutConsumesWithoutTerminator() {
	resetSource("abc");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockUntilInto(port, buffer, '\n', 10, ZERO_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.length == 3);
	CHECK(buffer.values[0] == 'a');
	CHECK(buffer.values[2] == 'c');
	CHECK(g_byteIndex == 3);
}

static void scenarioReadBlockUntilHonoursShortTimeoutAfterDrainingBuffer() {
	resetSource("abc");
	FakePort port;
	FakeBuffer buffer;
	const uint32_t shortTimeoutMillis = 300;
	const uint16_t collected = readBlockUntilInto(
		port, buffer, '\n', 10, shortTimeoutMillis, fakeCurrentMillis);
	CHECK(collected == 3);
	CHECK(buffer.length == 3);
	CHECK(g_byteIndex == 3);
	CHECK(g_millis <= shortTimeoutMillis + CLOCK_OVERSHOOT_TOLERANCE_MILLIS);
}

static void scenarioPeekThenReadConsumesTheByteOnce() {
	resetSource("AB");
	PendingFakePort port;
	CHECK(peekByteInto(port, port.hasPendingByte, port.pendingByte));
	CHECK(port.hasPendingByte);
	CHECK(port.pendingByte == 'A');
	CHECK(g_byteIndex == 1);

	const FakeByte consumed = port.read();
	CHECK(!consumed.isNull);
	CHECK(consumed.value == 'A');
	CHECK(!port.hasPendingByte);

	const FakeByte next = port.read();
	CHECK(!next.isNull);
	CHECK(next.value == 'B');
	CHECK(port.read().isNull);
}

static void scenarioReadBlockAfterPeekStartsWithPendingByte() {
	resetSource("AB");
	PendingFakePort port;
	CHECK(peekByteInto(port, port.hasPendingByte, port.pendingByte));

	FakeBuffer buffer;
	const uint16_t collected =
		readBlockInto(port, buffer, 2, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 2);
	CHECK(buffer.values[0] == 'A');
	CHECK(buffer.values[1] == 'B');
	CHECK(!port.hasPendingByte);
}

static void scenarioReadBlockTimeoutIsBounded() {
	resetSource("");
	FakePort port;
	FakeBuffer buffer;
	const uint16_t collected =
		readBlockInto(port, buffer, 5, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 0);
	CHECK(buffer.length == 0);
	CHECK(g_millis <= CLOCK_TIMEOUT_MILLIS + CLOCK_OVERSHOOT_TOLERANCE_MILLIS);
}

static void scenarioReadTextAccumulatesUntilQuiet() {
	resetSource("hello world");
	FakePort port;
	FakeLine text;
	const uint16_t collected =
		readTextInto(port, text, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(collected == 11);
	CHECK(text.length == 11);
	CHECK(text.text[0] == 'h');
	CHECK(text.text[10] == 'd');
}

static void scenarioReadTextWithZeroTimeoutReadsOnlyBufferedData() {
	resetSource("ready");
	FakePort port;
	FakeLine text;
	const uint16_t collected = readTextInto(port, text, 0, fakeCurrentMillis);
	CHECK(collected == 5);
	CHECK(text.length == 5);
	CHECK(g_byteIndex == 5);
}

static void scenarioReadTextWithZeroTimeoutOnQuietLineReturnsEmpty() {
	resetSource("");
	FakePort port;
	FakeLine text;
	const uint16_t collected = readTextInto(port, text, 0, fakeCurrentMillis);
	CHECK(collected == 0);
	CHECK(text.length == 0);
	CHECK(g_millis <= CLOCK_OVERSHOOT_TOLERANCE_MILLIS);
}

static void scenarioReadTextHonoursShortTimeout() {
	resetSource("");
	FakePort port;
	FakeLine text;
	const uint32_t shortTimeoutMillis = 250;
	readTextInto(port, text, shortTimeoutMillis, fakeCurrentMillis);
	CHECK(text.length == 0);
	CHECK(g_millis <= shortTimeoutMillis + CLOCK_OVERSHOOT_TOLERANCE_MILLIS);
}

static void scenarioFindTextConsumesThroughNeedle() {
	resetSource("abcXYZtail");
	FakePort port;
	const bool found = findTextInto(port, "XYZ", 3, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(found);
	CHECK(g_byteIndex == 6);
}

static void scenarioFindTextHandlesOverlappingPrefix() {
	resetSource("aaab");
	FakePort port;
	const bool found = findTextInto(port, "aab", 3, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(found);
	CHECK(g_byteIndex == 4);
}

static void scenarioFindTextReportsMissingNeedle() {
	resetSource("abcdef");
	FakePort port;
	const bool found = findTextInto(port, "zz", 2, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(!found);
}

static void scenarioFindTextWithEmptyNeedleFindsImmediately() {
	resetSource("abc");
	FakePort port;
	const bool found = findTextInto(port, "", 0, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(found);
	CHECK(g_byteIndex == 0);
}

static void scenarioFindTextUntilFindsNeedleBeforeTerminator() {
	resetSource("xxneedle\ntail");
	FakePort port;
	const bool found = findTextUntilInto(port, "needle", 6, '\n', true, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(found);
	CHECK(g_byteIndex == 8);
}

static void scenarioFindTextUntilStopsAtTerminator() {
	resetSource("abc\nneedle");
	FakePort port;
	const bool found = findTextUntilInto(port, "needle", 6, '\n', true, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(!found);
	CHECK(g_byteIndex == 4);
}

static void scenarioFindTextUntilTimesOutWithoutOverConsuming() {
	resetSource("abc");
	FakePort port;
	const bool found = findTextUntilInto(port, "zz", 2, '\n', true, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(!found);
	CHECK(g_byteIndex == 3);
}

static void scenarioFindTextUntilWithZeroTimeoutDrainsBufferedBytes() {
	resetSource("abc");
	FakePort port;
	const bool found = findTextUntilInto(port, "zz", 2, '\n', true, ZERO_TIMEOUT_MILLIS, fakeCurrentMillis);
	CHECK(!found);
	CHECK(g_byteIndex == 3);
}

static bool nearlyEqual(float actual, float expected) {
	const float difference = actual - expected;
	return difference < 0.0001f && difference > -0.0001f;
}

static void scenarioReadFloatParsesInteger() {
	resetSource("42");
	FakePort port;
	CHECK(nearlyEqual(readFloatFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis), 42.0f));
}

static void scenarioReadFloatParsesSignedDecimal() {
	resetSource("-3.5");
	FakePort port;
	CHECK(nearlyEqual(readFloatFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis), -3.5f));
}

static void scenarioReadFloatParsesPositiveExponent() {
	resetSource("1.5e3");
	FakePort port;
	CHECK(nearlyEqual(readFloatFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis), 1500.0f));
}

static void scenarioReadFloatParsesNegativeExponent() {
	resetSource("2E-2");
	FakePort port;
	CHECK(nearlyEqual(readFloatFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis), 0.02f));
}

static void scenarioReadFloatStopsAfterNumber() {
	resetSource("12.5abc");
	FakePort port;
	CHECK(nearlyEqual(readFloatFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis), 12.5f));
}

static void scenarioReadFloatReturnsZeroWithoutNumber() {
	resetSource("hello");
	FakePort port;
	CHECK(readFloatFrom(port, CLOCK_TIMEOUT_MILLIS, fakeCurrentMillis) == 0.0f);
}

static void scenarioReadFloatWithZeroTimeoutOnQuietLineReturnsZero() {
	resetSource("");
	FakePort port;
	CHECK(readFloatFrom(port, 0, fakeCurrentMillis) == 0.0f);
}

int main() {
	scenarioReadLineStopsAtTerminator();
	scenarioReadLineTimesOutOnQuietLine();
	scenarioReadLineKeepsBytesWithoutTerminator();
	scenarioReadTextUntilStopsAtCarriageReturn();
	scenarioReadTextUntilDropsTrailingTerminatorAtStreamEnd();
	scenarioReadTextUntilDropsOnlyTheFirstRepeatedTerminator();
	scenarioReadTextUntilKeepsBytesWithoutTerminator();
	scenarioReadTextUntilOnEmptyStreamReturnsEmpty();
	scenarioReadIntegerParsesDigits();
	scenarioReadIntegerParsesNegative();
	scenarioReadIntegerSkipsLeadingNoiseAndStops();
	scenarioReadIntegerReturnsZeroOnNoDigits();
	scenarioReadIntegerClampsOverflow();
	scenarioReadIntegerAcceptsPlusSign();
	scenarioPeekKeepsTheSameByte();
	scenarioPeekReportsEmptyLine();
	scenarioReadBlockStopsAtMaximum();
	scenarioReadBlockKeepsBytesUntilTimeout();
	scenarioReadBlockWithZeroMaximumDoesNotWait();
	scenarioReadBlockWithZeroTimeoutConsumesBufferedBytes();
	scenarioReadBlockWithZeroTimeoutOnQuietLineReturnsEmpty();
	scenarioReadBlockHonoursShortTimeoutAfterDrainingBuffer();
	scenarioReadBlockUntilDropsTerminator();
	scenarioReadBlockUntilStopsAtMaximum();
	scenarioReadBlockUntilKeepsBytesWithoutTerminator();
	scenarioReadBlockUntilWithZeroMaximumDoesNotWait();
	scenarioReadBlockUntilWithZeroTimeoutDropsTerminator();
	scenarioReadBlockUntilWithZeroTimeoutConsumesWithoutTerminator();
	scenarioReadBlockUntilHonoursShortTimeoutAfterDrainingBuffer();
	scenarioPeekThenReadConsumesTheByteOnce();
	scenarioReadBlockAfterPeekStartsWithPendingByte();
	scenarioReadBlockTimeoutIsBounded();
	scenarioReadTextAccumulatesUntilQuiet();
	scenarioReadTextWithZeroTimeoutReadsOnlyBufferedData();
	scenarioReadTextWithZeroTimeoutOnQuietLineReturnsEmpty();
	scenarioReadTextHonoursShortTimeout();
	scenarioFindTextConsumesThroughNeedle();
	scenarioFindTextHandlesOverlappingPrefix();
	scenarioFindTextReportsMissingNeedle();
	scenarioFindTextWithEmptyNeedleFindsImmediately();
	scenarioFindTextUntilFindsNeedleBeforeTerminator();
	scenarioFindTextUntilStopsAtTerminator();
	scenarioFindTextUntilTimesOutWithoutOverConsuming();
	scenarioFindTextUntilWithZeroTimeoutDrainsBufferedBytes();
	scenarioReadFloatParsesInteger();
	scenarioReadFloatParsesSignedDecimal();
	scenarioReadFloatParsesPositiveExponent();
	scenarioReadFloatParsesNegativeExponent();
	scenarioReadFloatStopsAfterNumber();
	scenarioReadFloatReturnsZeroWithoutNumber();
	scenarioReadFloatWithZeroTimeoutOnQuietLineReturnsZero();

	if (failures == 0) {
		printf("Serial stream helpers: all scenarios passed\n");
		return 0;
	}
	printf("Serial stream helpers: %d check(s) failed\n", failures);
	return 1;
}
