// Host compile+behaviour guard for the generated AVR software-serial driver
// (src/arduino-nano/snapshots/engine/software_serial_hardware/). The generated
// translation unit is compiled verbatim against the AVR-like register surface in
// host/avr/io.h, so a regression in the pin->port mapping, the pin-change
// group/bit calculation, the receive ring buffer, the overflow policy, the
// pin-change ISR or the bit-banged frame fails here. The register names and bit
// positions come from the real ATmega328P header shipped by Arduino AVR 1.8.8
// (tools/avr-gcc/.../avr/iom328p.h): PINB/DDRB/PORTB at 0x03/0x04/0x05,
// PINC/DDRC/PORTC at 0x06/0x07/0x08, PIND/DDRD/PORTD at 0x09/0x0A/0x0B,
// PCIFR at 0x1B, PCICR at 0x68 and PCMSK0/1/2 at 0x6B/0x6C/0x6D with PCIE0/1/2
// and PCINT group bits 0..7.

#include <stdint.h>
#include <stdio.h>

#include <avr/io.h>
#include <core_gpio.h>

volatile uint8_t PINB = 0;
volatile uint8_t DDRB = 0;
volatile uint8_t PORTB = 0;
volatile uint8_t PINC = 0;
volatile uint8_t DDRC = 0;
volatile uint8_t PORTC = 0;
volatile uint8_t PIND = 0;
volatile uint8_t DDRD = 0;
volatile uint8_t PORTD = 0;
volatile uint8_t PCIFR = 0;
volatile uint8_t PCICR = 0;
volatile uint8_t PCMSK0 = 0;
volatile uint8_t PCMSK1 = 0;
volatile uint8_t PCMSK2 = 0;
volatile uint8_t SREG = 0;

#include "packages/test/src/arduino-nano/snapshots/engine/software_serial_hardware/core_software_serial_hardware.cpp"

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static const uint8_t PIN_CHANGE_GROUP_B = 0;
static const uint8_t PIN_CHANGE_GROUP_C = 1;
static const uint8_t PIN_CHANGE_GROUP_D = 2;
static const uint8_t PIN_CHANGE_NONE = 0xFF;
static const uint8_t MAXIMUM_RECEIVE_CAPACITY = 64;
static const uint8_t TRANSMIT_BIT = 3;
static const uint8_t SECOND_TRANSMIT_BIT = 5;
static const uint8_t RECEIVE_BIT = 2;
static const uint8_t SECOND_RECEIVE_BIT = 0;
static const uint8_t PIN_COUNT = 20;
static const uint8_t INVALID_PIN = 22;
static const uint32_t SLOW_BAUD_RATE = 300;
static const uint32_t STANDARD_BAUD_RATE = 9600;
static const uint32_t FAST_BAUD_RATE = 57600;
static const uint32_t UNSUPPORTED_FAST_BAUD_RATE = 115200;
static const uint16_t STANDARD_BIT_DELAY = 413;
static const uint16_t FAST_BIT_DELAY = 66;
static const uint16_t SLOW_BIT_DELAY = 13330;
static const uint16_t STANDARD_RECEIVE_CENTERING_DELAY = 189;
static const uint16_t FAST_RECEIVE_CENTERING_DELAY = 15;
static const uint8_t TRANSMIT_FRAME_SIZE = 10;
static const uint8_t TRANSMIT_BYTE = 0xA5;
static const uint8_t RECEIVE_BYTE = 0xA5;
static const uint8_t RECEIVE_BIT_COUNT = 8;
static const uint8_t RECEIVE_CENTERING_CALL = 1;
static const uint8_t RECEIVE_FIRST_BIT_CALL = 2;
static const uint8_t RECEIVE_STOP_CALL = 10;
static const uint8_t EXPECTED_LEVELS[TRANSMIT_FRAME_SIZE] = {
	0, 1, 0, 1, 0, 0, 1, 0, 1, 1,
};
static const uint8_t RECEIVE_FRAME_BITS[RECEIVE_BIT_COUNT] = {
	1, 0, 1, 0, 0, 1, 0, 1,
};

static uint8_t transmitLevels[TRANSMIT_FRAME_SIZE];
static uint16_t transmitDelays[TRANSMIT_FRAME_SIZE];
static uint8_t transmitStateCount = 0;
static uint8_t recordedTransmitBit = TRANSMIT_BIT;

static uint8_t receiveDelayCallCount = 0;
static uint16_t firstReceiveDelay = 0;
static uint16_t lastReceiveDelay = 0;
static boolean receiveMaskEnabledDuringFrame = false;
static boolean receiveStopBitLevel = true;

static void recordTransmitState(uint16_t delayLoops) {
	if (transmitStateCount >= TRANSMIT_FRAME_SIZE) {
		return;
	}
	transmitLevels[transmitStateCount] =
		(uint8_t)((PORTD & _BV(recordedTransmitBit)) != 0 ? 1 : 0);
	transmitDelays[transmitStateCount] = delayLoops;
	transmitStateCount++;
}

static void driveReceiveFrame(uint16_t delayLoops) {
	receiveDelayCallCount++;
	if (receiveDelayCallCount == RECEIVE_CENTERING_CALL) {
		firstReceiveDelay = delayLoops;
	}
	lastReceiveDelay = delayLoops;

	if ((PCMSK2 & _BV(RECEIVE_BIT)) != 0) {
		receiveMaskEnabledDuringFrame = true;
	}

	if (receiveDelayCallCount == RECEIVE_CENTERING_CALL) {
		return;
	}

	if (receiveDelayCallCount >= RECEIVE_FIRST_BIT_CALL &&
		receiveDelayCallCount < RECEIVE_STOP_CALL) {
		const uint8_t bitIndex =
			(uint8_t)(receiveDelayCallCount - RECEIVE_FIRST_BIT_CALL);
		PIND = (uint8_t)(RECEIVE_FRAME_BITS[bitIndex] != 0 ? _BV(RECEIVE_BIT) : 0);
		return;
	}

	if (receiveDelayCallCount == RECEIVE_STOP_CALL) {
		PIND = receiveStopBitLevel ? _BV(RECEIVE_BIT) : 0;
	}
}

static void resetReceiveDriverState() {
	receiveDelayCallCount = 0;
	firstReceiveDelay = 0;
	lastReceiveDelay = 0;
	receiveMaskEnabledDuringFrame = false;
	receiveStopBitLevel = true;
	PIND = 0;
}

static void resetRegisters() {
	for (uint8_t pin = 0; pin < PIN_COUNT; pin++) {
		core_software_serial_hardware::closePort(
			static_cast<core_gpio::Pin>(pin), static_cast<core_gpio::Pin>(pin));
	}

	PINB = 0;
	DDRB = 0;
	PORTB = 0;
	PINC = 0;
	DDRC = 0;
	PORTC = 0;
	PIND = 0;
	DDRD = 0;
	PORTD = 0;
	PCIFR = 0;
	PCICR = 0;
	PCMSK0 = 0;
	PCMSK1 = 0;
	PCMSK2 = 0;
	SREG = 0;
	transmitStateCount = 0;
	recordedTransmitBit = TRANSMIT_BIT;
	e95HostDelayLoopHook = nullptr;
	resetReceiveDriverState();
}

static void scenarioCalculatesPinChangeChannels() {
	CHECK(core_software_serial_hardware::getPinChangeGroup(core_gpio::PIN_2) ==
		  PIN_CHANGE_GROUP_D);
	CHECK(core_software_serial_hardware::getPinChangeBit(core_gpio::PIN_2) == 2);
	CHECK(core_software_serial_hardware::getPinChangeGroup(core_gpio::PIN_8) ==
		  PIN_CHANGE_GROUP_B);
	CHECK(core_software_serial_hardware::getPinChangeBit(core_gpio::PIN_8) == 0);
	CHECK(core_software_serial_hardware::getPinChangeGroup(core_gpio::PIN_A0) ==
		  PIN_CHANGE_GROUP_C);
	CHECK(core_software_serial_hardware::getPinChangeBit(core_gpio::PIN_A0) == 0);
	CHECK(core_software_serial_hardware::getPinChangeBit(core_gpio::PIN_A5) == 5);
	CHECK(core_software_serial_hardware::isReceivePin(core_gpio::PIN_A5));
	CHECK(core_software_serial_hardware::getPinChangeBit(core_gpio::PIN_A6) ==
		  PIN_CHANGE_NONE);
	CHECK(core_software_serial_hardware::getPinChangeBit(core_gpio::PIN_A7) ==
		  PIN_CHANGE_NONE);
	CHECK(!core_software_serial_hardware::isReceivePin(core_gpio::PIN_A6));
	CHECK(!core_software_serial_hardware::isReceivePin(core_gpio::PIN_A7));
	CHECK(!core_software_serial_hardware::isReceivePin(
		static_cast<core_gpio::Pin>(INVALID_PIN)));
}

static void scenarioConfiguresTransmitAndReceivePins() {
	resetRegisters();

	const boolean opened = core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);

	CHECK(opened);
	CHECK((DDRD & _BV(TRANSMIT_BIT)) != 0);
	CHECK((PORTD & _BV(TRANSMIT_BIT)) != 0);
	CHECK((DDRD & _BV(RECEIVE_BIT)) == 0);
	CHECK((PORTD & _BV(RECEIVE_BIT)) != 0);
	CHECK(PCICR == 0);
}

static void scenarioMovesTheReceiveLineBetweenPins() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);

	CHECK((PCICR & _BV(PCIE2)) != 0);
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) != 0);
	CHECK(core_software_serial_hardware::isReceiving(core_gpio::PIN_2));

	core_software_serial_hardware::openPort(
		core_gpio::PIN_5, core_gpio::PIN_8, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_8);

	CHECK(!core_software_serial_hardware::isReceiving(core_gpio::PIN_2));
	CHECK(core_software_serial_hardware::isReceiving(core_gpio::PIN_8));
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) == 0);
	CHECK((PCMSK0 & _BV(SECOND_RECEIVE_BIT)) != 0);
	CHECK((PCICR & _BV(PCIE0)) != 0);

	// Stopping a pin that does not own the line leaves the current listener.
	core_software_serial_hardware::stopReceive(core_gpio::PIN_2);
	CHECK(core_software_serial_hardware::isReceiving(core_gpio::PIN_8));

	core_software_serial_hardware::stopReceive(core_gpio::PIN_8);
	CHECK(!core_software_serial_hardware::isReceiving(core_gpio::PIN_8));
	CHECK((PCMSK0 & _BV(SECOND_RECEIVE_BIT)) == 0);
}

static void scenarioRepeatedStartClearsTheBuffer() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);

	for (uint8_t value = 0; value < MAXIMUM_RECEIVE_CAPACITY; value++) {
		core_software_serial_hardware::storeReceivedByte(value);
	}
	core_software_serial_hardware::storeReceivedByte(MAXIMUM_RECEIVE_CAPACITY);
	CHECK(core_software_serial_hardware::hasReceiveOverflow());

	core_software_serial_hardware::startReceive(core_gpio::PIN_2);

	CHECK(core_software_serial_hardware::isReceiving(core_gpio::PIN_2));
	CHECK(!core_software_serial_hardware::hasBufferedData());
	CHECK(!core_software_serial_hardware::hasReceiveOverflow());
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) != 0);
}

static void scenarioReinitializingTheSameReceivePinUpdatesTiming() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	e95HostDelayLoopHook = driveReceiveFrame;

	e95_pcint2_interrupt();
	CHECK(firstReceiveDelay == STANDARD_RECEIVE_CENTERING_DELAY);

	// Re-initializing the same receive pin at a faster rate must recompute the
	// centering, bit and stop delays, not keep the previous bit timing.
	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, FAST_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	resetReceiveDriverState();

	e95_pcint2_interrupt();
	CHECK(firstReceiveDelay == FAST_RECEIVE_CENTERING_DELAY);
	CHECK(lastReceiveDelay != STANDARD_RECEIVE_CENTERING_DELAY);
}

static void scenarioClosingAHandleKeepsTheSharedReceiveTiming() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	core_software_serial_hardware::openPort(
		static_cast<core_gpio::Pin>(SECOND_TRANSMIT_BIT),
		core_gpio::PIN_2,
		FAST_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);

	// Both handles share the receive pin; closing one stops the receiver it
	// owns but must not erase the timing the other handle configured.
	core_software_serial_hardware::closePort(
		static_cast<core_gpio::Pin>(SECOND_TRANSMIT_BIT), core_gpio::PIN_2);
	CHECK(!core_software_serial_hardware::isReceiving(core_gpio::PIN_2));

	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	CHECK(core_software_serial_hardware::isReceiving(core_gpio::PIN_2));
	e95HostDelayLoopHook = driveReceiveFrame;
	resetReceiveDriverState();

	e95_pcint2_interrupt();
	CHECK(firstReceiveDelay == FAST_RECEIVE_CENTERING_DELAY);
}

static void scenarioReceivesInOrderAcrossTheWholeBuffer() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);

	CHECK(core_software_serial_hardware::getReceiveCapacity() ==
		  MAXIMUM_RECEIVE_CAPACITY);

	for (uint8_t value = 0; value < MAXIMUM_RECEIVE_CAPACITY; value++) {
		core_software_serial_hardware::storeReceivedByte(value);
	}

	CHECK(core_software_serial_hardware::hasBufferedData());

	for (uint8_t value = 0; value < MAXIMUM_RECEIVE_CAPACITY; value++) {
		CHECK(core_software_serial_hardware::readBufferedByte() == value);
	}

	CHECK(!core_software_serial_hardware::hasBufferedData());
}

static void scenarioDropsTheOldestByteOnOverflow() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);

	for (uint8_t value = 0; value < MAXIMUM_RECEIVE_CAPACITY; value++) {
		core_software_serial_hardware::storeReceivedByte(value);
	}
	core_software_serial_hardware::storeReceivedByte(MAXIMUM_RECEIVE_CAPACITY);

	CHECK(core_software_serial_hardware::hasReceiveOverflow());
	CHECK(core_software_serial_hardware::peekBufferedByte() == 1);
	CHECK(core_software_serial_hardware::readBufferedByte() == 1);
	CHECK(core_software_serial_hardware::readBufferedByte() == 2);

	// The flag survives reads and is cleared only by claiming the line again.
	CHECK(core_software_serial_hardware::hasReceiveOverflow());
	core_software_serial_hardware::stopReceive(core_gpio::PIN_2);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	CHECK(!core_software_serial_hardware::hasReceiveOverflow());
}

static void scenarioSimulatesTheReceiveInterrupt() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	e95HostDelayLoopHook = driveReceiveFrame;

	e95_pcint2_interrupt();

	CHECK(receiveDelayCallCount == RECEIVE_STOP_CALL);
	CHECK(!receiveMaskEnabledDuringFrame);
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) != 0);
	CHECK((PCICR & _BV(PCIE2)) != 0);
	// On the device writing a one to PCIFR clears the flag; the host stub keeps
	// the written value, so the check pins that the ISR acknowledges the group.
	CHECK(PCIFR == _BV(PIN_CHANGE_GROUP_D));
	CHECK(core_software_serial_hardware::hasBufferedData());
	CHECK(core_software_serial_hardware::readBufferedByte() == RECEIVE_BYTE);
}

static void scenarioDiscardsAFrameWithALowStopBit() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	e95HostDelayLoopHook = driveReceiveFrame;
	receiveStopBitLevel = false;

	e95_pcint2_interrupt();

	CHECK(receiveDelayCallCount == RECEIVE_STOP_CALL);
	CHECK(!receiveMaskEnabledDuringFrame);
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) != 0);
	CHECK(!core_software_serial_hardware::hasBufferedData());
}

static void scenarioIgnoresARisingEdge() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	e95HostDelayLoopHook = driveReceiveFrame;
	PIND = _BV(RECEIVE_BIT);

	e95_pcint2_interrupt();

	CHECK(receiveDelayCallCount == 0);
	CHECK(!core_software_serial_hardware::hasBufferedData());
}

static void scenarioSupportsOnlyTheValidatedBaudRates() {
	CHECK(core_software_serial_hardware::isBaudRateSupported(SLOW_BAUD_RATE));
	CHECK(core_software_serial_hardware::isBaudRateSupported(STANDARD_BAUD_RATE));
	CHECK(core_software_serial_hardware::isBaudRateSupported(FAST_BAUD_RATE));
	CHECK(!core_software_serial_hardware::isBaudRateSupported(200));
	CHECK(!core_software_serial_hardware::isBaudRateSupported(0));
	CHECK(!core_software_serial_hardware::isBaudRateSupported(
		UNSUPPORTED_FAST_BAUD_RATE));
	CHECK(!core_software_serial_hardware::isBaudRateSupported(250000));

	resetRegisters();
	CHECK(!core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, 200));
	CHECK((DDRD & _BV(TRANSMIT_BIT)) == 0);

	core_software_serial_hardware::startReceive(core_gpio::PIN_2);

	CHECK(!core_software_serial_hardware::isReceiving(core_gpio::PIN_2));
	CHECK(PCICR == 0);
	CHECK(PCMSK2 == 0);
}

static void scenarioBitBangsTheStandardFrame() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	e95HostDelayLoopHook = recordTransmitState;

	core_software_serial_hardware::sendByte(core_gpio::PIN_3, TRANSMIT_BYTE);

	CHECK(transmitStateCount == TRANSMIT_FRAME_SIZE);
	for (uint8_t index = 0; index < TRANSMIT_FRAME_SIZE; index++) {
		CHECK(transmitLevels[index] == EXPECTED_LEVELS[index]);
		CHECK(transmitDelays[index] == STANDARD_BIT_DELAY);
	}
}

static void scenarioBitBangsAtTheFastestSupportedRate() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, FAST_BAUD_RATE);
	e95HostDelayLoopHook = recordTransmitState;

	core_software_serial_hardware::sendByte(core_gpio::PIN_3, TRANSMIT_BYTE);

	CHECK(transmitStateCount == TRANSMIT_FRAME_SIZE);
	for (uint8_t index = 0; index < TRANSMIT_FRAME_SIZE; index++) {
		CHECK(transmitDelays[index] == FAST_BIT_DELAY);
	}
}

static void scenarioBitBangsAtTheSlowestSupportedRate() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, SLOW_BAUD_RATE);
	e95HostDelayLoopHook = recordTransmitState;

	core_software_serial_hardware::sendByte(core_gpio::PIN_3, TRANSMIT_BYTE);

	CHECK(transmitStateCount == TRANSMIT_FRAME_SIZE);
	for (uint8_t index = 0; index < TRANSMIT_FRAME_SIZE; index++) {
		CHECK(transmitDelays[index] == SLOW_BIT_DELAY);
	}
}

static void scenarioKeepsTransmitTimingPerHandle() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::openPort(
		static_cast<core_gpio::Pin>(SECOND_TRANSMIT_BIT),
		core_gpio::PIN_8,
		FAST_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	e95HostDelayLoopHook = recordTransmitState;

	core_software_serial_hardware::sendByte(core_gpio::PIN_3, TRANSMIT_BYTE);

	CHECK(transmitStateCount == TRANSMIT_FRAME_SIZE);
	for (uint8_t index = 0; index < TRANSMIT_FRAME_SIZE; index++) {
		CHECK(transmitDelays[index] == STANDARD_BIT_DELAY);
	}

	transmitStateCount = 0;
	recordedTransmitBit = SECOND_TRANSMIT_BIT;
	core_software_serial_hardware::sendByte(
		static_cast<core_gpio::Pin>(SECOND_TRANSMIT_BIT), TRANSMIT_BYTE);

	CHECK(transmitStateCount == TRANSMIT_FRAME_SIZE);
	for (uint8_t index = 0; index < TRANSMIT_FRAME_SIZE; index++) {
		CHECK(transmitDelays[index] == FAST_BIT_DELAY);
	}
}

static void scenarioOpeningAnotherHandleKeepsTheReceiver() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	core_software_serial_hardware::storeReceivedByte(TRANSMIT_BYTE);

	core_software_serial_hardware::openPort(
		static_cast<core_gpio::Pin>(SECOND_TRANSMIT_BIT),
		core_gpio::PIN_8,
		FAST_BAUD_RATE);

	CHECK(core_software_serial_hardware::isReceiving(core_gpio::PIN_2));
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) != 0);
	CHECK(core_software_serial_hardware::hasBufferedData());
	CHECK(core_software_serial_hardware::readBufferedByte() == TRANSMIT_BYTE);
}

static void scenarioCloseReleasesOnlyTheHandlePins() {
	resetRegisters();

	core_software_serial_hardware::openPort(
		core_gpio::PIN_3, core_gpio::PIN_2, STANDARD_BAUD_RATE);
	core_software_serial_hardware::startReceive(core_gpio::PIN_2);
	core_software_serial_hardware::storeReceivedByte(TRANSMIT_BYTE);
	core_software_serial_hardware::openPort(
		static_cast<core_gpio::Pin>(SECOND_TRANSMIT_BIT),
		core_gpio::PIN_8,
		FAST_BAUD_RATE);

	core_software_serial_hardware::closePort(
		static_cast<core_gpio::Pin>(SECOND_TRANSMIT_BIT), core_gpio::PIN_8);

	CHECK((DDRD & _BV(SECOND_TRANSMIT_BIT)) == 0);
	CHECK((DDRD & _BV(TRANSMIT_BIT)) != 0);
	CHECK(core_software_serial_hardware::isReceiving(core_gpio::PIN_2));
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) != 0);
	CHECK(core_software_serial_hardware::hasBufferedData());

	core_software_serial_hardware::closePort(core_gpio::PIN_3, core_gpio::PIN_2);

	CHECK((DDRD & _BV(TRANSMIT_BIT)) == 0);
	CHECK(!core_software_serial_hardware::isReceiving(core_gpio::PIN_2));
	CHECK(!core_software_serial_hardware::hasBufferedData());
	CHECK((PCMSK2 & _BV(RECEIVE_BIT)) == 0);
}

int main() {
	scenarioCalculatesPinChangeChannels();
	scenarioConfiguresTransmitAndReceivePins();
	scenarioMovesTheReceiveLineBetweenPins();
	scenarioRepeatedStartClearsTheBuffer();
	scenarioReinitializingTheSameReceivePinUpdatesTiming();
	scenarioClosingAHandleKeepsTheSharedReceiveTiming();
	scenarioReceivesInOrderAcrossTheWholeBuffer();
	scenarioDropsTheOldestByteOnOverflow();
	scenarioSimulatesTheReceiveInterrupt();
	scenarioDiscardsAFrameWithALowStopBit();
	scenarioIgnoresARisingEdge();
	scenarioSupportsOnlyTheValidatedBaudRates();
	scenarioBitBangsTheStandardFrame();
	scenarioBitBangsAtTheFastestSupportedRate();
	scenarioBitBangsAtTheSlowestSupportedRate();
	scenarioKeepsTransmitTimingPerHandle();
	scenarioOpeningAnotherHandleKeepsTheReceiver();
	scenarioCloseReleasesOnlyTheHandlePins();

	if (failures > 0) {
		printf("software-serial-arduino-config: %d failure(s)\n", failures);
		return 1;
	}

	printf("software-serial-arduino-config: all checks passed\n");
	return 0;
}
