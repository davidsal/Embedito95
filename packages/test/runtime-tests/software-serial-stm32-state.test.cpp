// Host compile+behaviour guard for the STM32 software-serial receive state
// machine and ring buffer (registry strategy fragment
// software_serial_hardware_state.inc). The fragment is intentionally free of
// STM32 registers so the same source the generated driver injects can run on
// the host: the 3x-oversampled tick state machine, the LSB-first frame, the
// low-stop-bit framing rejection, the 64-byte buffer and the
// discard-the-oldest overflow policy are all executed here.

#include <stdint.h>
#include <stdio.h>

#include <core_type.h>

#include "packages/registry/src/strategies/stm32-ll/software_serial_hardware/software_serial_hardware_state.inc"

static const uint8_t MAXIMUM_RECEIVE_CAPACITY = 64;
static const uint8_t OVERSAMPLE_TICKS = 3;
static const uint8_t START_CENTERING_TICKS = 4;
static const uint8_t DATA_BIT_COUNT = 8;
static const uint8_t TRANSMIT_BYTE = 0xA5;
static const uint8_t ALTERNATING_BYTE = 0x5A;
static const uint8_t FULL_FRAME_VALUE = 0xFF;
static const uint8_t EMPTY_FRAME_VALUE = 0x00;
static const uint8_t FIRST_STORED_VALUE = 1;
static const uint8_t PEEKED_OVERFLOW_VALUE = 1;

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void resetDriver(
	software_serial_detail::ReceiveState &state,
	software_serial_detail::ReceiveBuffer &buffer) {
	software_serial_detail::resetReceiveBuffer(buffer);
	software_serial_detail::resetReceiveState(state);
}

static void processTick(
	software_serial_detail::ReceiveState &state,
	software_serial_detail::ReceiveBuffer &buffer,
	bool lineHigh) {
	software_serial_detail::processReceiveTick(state, buffer, lineHigh);
}

static void feedFrame(
	software_serial_detail::ReceiveState &state,
	software_serial_detail::ReceiveBuffer &buffer,
	uint8_t value,
	bool stopHigh) {
	processTick(state, buffer, true);

	processTick(state, buffer, false);

	for (uint8_t bitIndex = 0; bitIndex < DATA_BIT_COUNT; bitIndex++) {
		const bool bitHigh = (value & (uint8_t)(1u << bitIndex)) != 0;
		const uint8_t tickCount =
			bitIndex == 0 ? START_CENTERING_TICKS : OVERSAMPLE_TICKS;
		for (uint8_t tick = 0; tick < tickCount; tick++) {
			processTick(state, buffer, bitHigh);
		}
	}

	for (uint8_t tick = 0; tick < OVERSAMPLE_TICKS; tick++) {
		processTick(state, buffer, stopHigh);
	}
}

static void scenarioKeepsTheCapacityAndDropsTheOldestByte() {
	software_serial_detail::ReceiveBuffer buffer = {};
	software_serial_detail::ReceiveState state = {};
	resetDriver(state, buffer);

	for (uint8_t value = 0; value < MAXIMUM_RECEIVE_CAPACITY; value++) {
		software_serial_detail::storeByte(buffer, value + FIRST_STORED_VALUE);
	}

	CHECK(!software_serial_detail::hasOverflowed(buffer));
	CHECK(software_serial_detail::hasBufferedByte(buffer));
	CHECK(software_serial_detail::peekBufferedByte(buffer) == FIRST_STORED_VALUE);

	software_serial_detail::storeByte(buffer, MAXIMUM_RECEIVE_CAPACITY);

	CHECK(software_serial_detail::hasOverflowed(buffer));
	CHECK(software_serial_detail::peekBufferedByte(buffer) ==
		  FIRST_STORED_VALUE + 1);
	CHECK(software_serial_detail::readBufferedByte(buffer) ==
		  FIRST_STORED_VALUE + 1);
}

static void scenarioReadsBytesInOrderAndClearsOnReset() {
	software_serial_detail::ReceiveBuffer buffer = {};
	software_serial_detail::ReceiveState state = {};
	resetDriver(state, buffer);

	software_serial_detail::storeByte(buffer, ALTERNATING_BYTE);
	software_serial_detail::storeByte(buffer, TRANSMIT_BYTE);

	CHECK(software_serial_detail::peekBufferedByte(buffer) == ALTERNATING_BYTE);
	CHECK(software_serial_detail::readBufferedByte(buffer) == ALTERNATING_BYTE);
	CHECK(software_serial_detail::readBufferedByte(buffer) == TRANSMIT_BYTE);
	CHECK(!software_serial_detail::hasBufferedByte(buffer));
	CHECK(software_serial_detail::readBufferedByte(buffer) == 0);

	software_serial_detail::storeByte(buffer, FULL_FRAME_VALUE);
	software_serial_detail::resetReceiveBuffer(buffer);

	CHECK(!software_serial_detail::hasBufferedByte(buffer));
	CHECK(!software_serial_detail::hasOverflowed(buffer));
}

static void scenarioReceivesAnOversampledFrame() {
	software_serial_detail::ReceiveBuffer buffer = {};
	software_serial_detail::ReceiveState state = {};
	resetDriver(state, buffer);

	feedFrame(state, buffer, TRANSMIT_BYTE, true);

	CHECK(software_serial_detail::hasBufferedByte(buffer));
	CHECK(software_serial_detail::readBufferedByte(buffer) == TRANSMIT_BYTE);
}

static void scenarioReceivesFullAndEmptyFrames() {
	software_serial_detail::ReceiveBuffer buffer = {};
	software_serial_detail::ReceiveState state = {};
	resetDriver(state, buffer);

	feedFrame(state, buffer, FULL_FRAME_VALUE, true);
	feedFrame(state, buffer, EMPTY_FRAME_VALUE, true);

	CHECK(software_serial_detail::readBufferedByte(buffer) == FULL_FRAME_VALUE);
	CHECK(software_serial_detail::readBufferedByte(buffer) == EMPTY_FRAME_VALUE);
}

static void scenarioDiscardsAFrameWithALowStopBit() {
	software_serial_detail::ReceiveBuffer buffer = {};
	software_serial_detail::ReceiveState state = {};
	resetDriver(state, buffer);

	feedFrame(state, buffer, TRANSMIT_BYTE, false);

	CHECK(!software_serial_detail::hasBufferedByte(buffer));
}

static void scenarioWaitsForALowStartBit() {
	software_serial_detail::ReceiveBuffer buffer = {};
	software_serial_detail::ReceiveState state = {};
	resetDriver(state, buffer);

	for (uint8_t tick = 0; tick < 10; tick++) {
		processTick(state, buffer, true);
	}

	CHECK(!software_serial_detail::hasBufferedByte(buffer));
	CHECK(!software_serial_detail::hasOverflowed(buffer));
}

static void scenarioSurvivesAnOverflowDuringReceive() {
	software_serial_detail::ReceiveBuffer buffer = {};
	software_serial_detail::ReceiveState state = {};
	resetDriver(state, buffer);

	for (uint16_t index = 0; index < MAXIMUM_RECEIVE_CAPACITY + 1; index++) {
		feedFrame(state, buffer, (uint8_t)index, true);
	}

	CHECK(software_serial_detail::hasOverflowed(buffer));
	CHECK(software_serial_detail::peekBufferedByte(buffer) ==
		  PEEKED_OVERFLOW_VALUE);
}

int main() {
	scenarioKeepsTheCapacityAndDropsTheOldestByte();
	scenarioReadsBytesInOrderAndClearsOnReset();
	scenarioReceivesAnOversampledFrame();
	scenarioReceivesFullAndEmptyFrames();
	scenarioDiscardsAFrameWithALowStopBit();
	scenarioWaitsForALowStartBit();
	scenarioSurvivesAnOverflowDuringReceive();

	if (failures > 0) {
		printf("software-serial-stm32-state: %d failure(s)\n", failures);
		return 1;
	}

	printf("software-serial-stm32-state: all checks passed\n");
	return 0;
}
