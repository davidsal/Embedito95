// Host compile+behaviour guard for the *generated* software-serial library
// (src/arduino-nano/snapshots/engine/software_serial/lib_software_serial.cpp).
// The generated translation unit is compiled verbatim against a recording
// double of core_software_serial_hardware (host/core_software_serial_hardware.h),
// so the single-listener contract, the null reads, the buffer queries, the
// overflow flag, send/sendLine framing and close are executed instead of only
// pinned by a snapshot. The AVR register behaviour is covered separately by
// software-serial-arduino-config.test.cpp.

#include <stdint.h>
#include <stdio.h>

#include <core_gpio.h>
#include <core_object.h>
#include <core_software_serial_hardware.h>

// The generated closure methods always receive the `self` handle, and the
// methods that only forward to the hardware module do not read any field from
// it. Keep the test compiled with -Werror without changing the shared codegen.
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-parameter"
#include "packages/test/src/arduino-nano/snapshots/engine/software_serial/lib_software_serial.cpp"
#pragma GCC diagnostic pop

static const uint8_t RECEIVE_CAPACITY = 64;
static const uint8_t PIN_COUNT = 20;
static const uint8_t NO_ACTIVE_PIN = 0xFF;
static const uint8_t TRANSMIT_PIN = 3;
static const uint8_t SECOND_TRANSMIT_PIN = 5;
static const uint8_t RECEIVE_PIN = 2;
static const uint8_t SECOND_RECEIVE_PIN = 8;
static const uint32_t MINIMUM_BAUD_RATE = 300;
static const uint32_t MAXIMUM_BAUD_RATE = 57600;
static const uint32_t STANDARD_BAUD_RATE = 9600;
static const uint32_t UNSUPPORTED_BAUD_RATE = 115200;
static const uint8_t SEND_TEXT_LENGTH = 2;
static const uint8_t CARRIAGE_RETURN = 13;
static const uint8_t LINE_FEED = 10;
static const uint8_t FIRST_VALUE = 7;
static const uint8_t SECOND_VALUE = 9;

static uint8_t activeReceivePin = NO_ACTIVE_PIN;
static uint8_t openTransmitPin = NO_ACTIVE_PIN;
static uint8_t openReceivePin = NO_ACTIVE_PIN;
static uint32_t openedBaudRate = 0;
static uint32_t openPortCallCount = 0;
static uint32_t closePortCallCount = 0;
static uint32_t startReceiveCallCount = 0;
static uint32_t stopReceiveCallCount = 0;
static uint32_t readStreamLineCallCount = 0;
static uint32_t readStreamIntegerCallCount = 0;
static boolean overflowFlag = false;
static boolean openTransmitPins[PIN_COUNT];

static uint8_t sentBytes[RECEIVE_CAPACITY];
static uint8_t sentTransmitPins[RECEIVE_CAPACITY];
static uint8_t sentByteCount = 0;
static uint8_t bufferedBytes[RECEIVE_CAPACITY];
static uint8_t bufferedHead = 0;
static uint8_t bufferedCount = 0;

u8 core_software_serial_hardware::getReceiveCapacity() {
	return RECEIVE_CAPACITY;
}

boolean core_software_serial_hardware::isBaudRateSupported(u32 baudRate) {
	return baudRate >= MINIMUM_BAUD_RATE && baudRate <= MAXIMUM_BAUD_RATE;
}

boolean core_software_serial_hardware::isReceivePin(core_gpio::Pin pin) {
	return (u8)pin <= core_gpio::PIN_A5;
}

u8 core_software_serial_hardware::getPinChangeGroup(core_gpio::Pin pin) {
	(void)pin;
	return 0;
}

u8 core_software_serial_hardware::getPinChangeBit(core_gpio::Pin pin) {
	(void)pin;
	return 0;
}

boolean core_software_serial_hardware::openPort(
	core_gpio::Pin transmitPin, core_gpio::Pin receivePin, u32 baudRate) {
	openPortCallCount++;
	if (!isBaudRateSupported(baudRate)) {
		return false;
	}
	openTransmitPin = (u8)transmitPin;
	openReceivePin = (u8)receivePin;
	openedBaudRate = baudRate;
	openTransmitPins[(u8)transmitPin] = true;
	return true;
}

void core_software_serial_hardware::closePort(
	core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	closePortCallCount++;
	openTransmitPins[(u8)transmitPin] = false;
	if (openTransmitPin == (u8)transmitPin) {
		openTransmitPin = NO_ACTIVE_PIN;
	}
	if (activeReceivePin == (u8)receivePin) {
		activeReceivePin = NO_ACTIVE_PIN;
		openReceivePin = NO_ACTIVE_PIN;
		bufferedHead = 0;
		bufferedCount = 0;
		overflowFlag = false;
	}
}

void core_software_serial_hardware::startReceive(core_gpio::Pin receivePin) {
	startReceiveCallCount++;
	activeReceivePin = (u8)receivePin;
	bufferedHead = 0;
	bufferedCount = 0;
	overflowFlag = false;
}

void core_software_serial_hardware::stopReceive(core_gpio::Pin receivePin) {
	stopReceiveCallCount++;
	if (activeReceivePin == (u8)receivePin) {
		activeReceivePin = NO_ACTIVE_PIN;
	}
}

boolean core_software_serial_hardware::isReceiving(core_gpio::Pin receivePin) {
	return activeReceivePin == (u8)receivePin;
}

void core_software_serial_hardware::sendByte(core_gpio::Pin transmitPin, u8 value) {
	if (sentByteCount < RECEIVE_CAPACITY) {
		sentBytes[sentByteCount] = value;
		sentTransmitPins[sentByteCount] = (u8)transmitPin;
	}
	sentByteCount++;
}

boolean core_software_serial_hardware::hasBufferedData() {
	return bufferedCount > 0;
}

u8 core_software_serial_hardware::readBufferedByte() {
	if (bufferedCount == 0) {
		return 0;
	}
	const u8 value = bufferedBytes[bufferedHead];
	bufferedHead = (u8)((bufferedHead + 1) % RECEIVE_CAPACITY);
	bufferedCount--;
	return value;
}

u8 core_software_serial_hardware::peekBufferedByte() {
	if (bufferedCount == 0) {
		return 0;
	}
	return bufferedBytes[bufferedHead];
}

boolean core_software_serial_hardware::hasReceiveOverflow() {
	return overflowFlag;
}

void core_software_serial_hardware::storeReceivedByte(u8 value) {
	if (bufferedCount == RECEIVE_CAPACITY) {
		bufferedHead = (u8)((bufferedHead + 1) % RECEIVE_CAPACITY);
		bufferedCount--;
		overflowFlag = true;
	}
	const u8 tail = (u8)((bufferedHead + bufferedCount) % RECEIVE_CAPACITY);
	bufferedBytes[tail] = value;
	bufferedCount++;
}

core_string::String core_software_serial_hardware::readStreamLine() {
	readStreamLineCallCount++;
	return core_string::String("line");
}

i32 core_software_serial_hardware::readStreamInteger() {
	readStreamIntegerCallCount++;
	return 42;
}

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void resetDouble() {
	activeReceivePin = NO_ACTIVE_PIN;
	openTransmitPin = NO_ACTIVE_PIN;
	openReceivePin = NO_ACTIVE_PIN;
	openedBaudRate = 0;
	openPortCallCount = 0;
	closePortCallCount = 0;
	startReceiveCallCount = 0;
	stopReceiveCallCount = 0;
	readStreamLineCallCount = 0;
	readStreamIntegerCallCount = 0;
	overflowFlag = false;
	sentByteCount = 0;
	bufferedHead = 0;
	bufferedCount = 0;
	for (uint8_t pin = 0; pin < PIN_COUNT; pin++) {
		openTransmitPins[pin] = false;
		sentTransmitPins[pin] = NO_ACTIVE_PIN;
	}
}

static core_object::Object<lib_software_serial::SoftwareSerialPort> createPort(
	core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	return lib_software_serial::getSoftwareSerial(transmitPin, receivePin);
}

static void scenarioInitializesAndClaimsTheReceiveLine() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, STANDARD_BAUD_RATE);

	CHECK(openPortCallCount == 1);
	CHECK(openTransmitPin == TRANSMIT_PIN);
	CHECK(openReceivePin == RECEIVE_PIN);
	CHECK(openedBaudRate == STANDARD_BAUD_RATE);
	CHECK(startReceiveCallCount == 1);
	CHECK(lib_software_serial::isListening(port));
}

static void scenarioSendsTextAndLineTerminators() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, STANDARD_BAUD_RATE);
	lib_software_serial::send(port, "AB");
	lib_software_serial::sendLine(port, "AB");

	CHECK(sentByteCount == SEND_TEXT_LENGTH * 2 + 2);
	CHECK(sentBytes[0] == 'A');
	CHECK(sentBytes[1] == 'B');
	CHECK(sentBytes[2] == 'A');
	CHECK(sentBytes[3] == 'B');
	CHECK(sentBytes[4] == CARRIAGE_RETURN);
	CHECK(sentBytes[5] == LINE_FEED);
}

static void scenarioReadsNullWhenTheBufferIsEmpty() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, STANDARD_BAUD_RATE);

	CHECK(!lib_software_serial::hasData(port));
	CHECK(lib_software_serial::read(port).isNull);
	CHECK(lib_software_serial::getNextByte(port).isNull);
}

static void scenarioReadsWithoutConsumingOnPeek() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, STANDARD_BAUD_RATE);
	core_software_serial_hardware::storeReceivedByte(FIRST_VALUE);
	core_software_serial_hardware::storeReceivedByte(SECOND_VALUE);

	CHECK(lib_software_serial::hasData(port));

	const nullable<u8> firstRead = lib_software_serial::read(port);
	CHECK(!firstRead.isNull);
	CHECK(firstRead.value == FIRST_VALUE);

	const nullable<u8> nextRead = lib_software_serial::getNextByte(port);
	CHECK(nextRead.value == SECOND_VALUE);

	const nullable<u8> secondRead = lib_software_serial::read(port);
	CHECK(secondRead.value == SECOND_VALUE);
	CHECK(lib_software_serial::read(port).isNull);
}

static void scenarioOnlyTheListenerReads() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> first =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);
	core_object::Object<lib_software_serial::SoftwareSerialPort> second =
		createPort(core_gpio::PIN_3, static_cast<core_gpio::Pin>(SECOND_RECEIVE_PIN));

	lib_software_serial::initialize(first, STANDARD_BAUD_RATE);
	core_software_serial_hardware::storeReceivedByte(FIRST_VALUE);

	lib_software_serial::startListening(second);

	CHECK(startReceiveCallCount == 2);
	CHECK(!lib_software_serial::isListening(first));
	CHECK(lib_software_serial::isListening(second));
	CHECK(!lib_software_serial::hasData(first));
	CHECK(lib_software_serial::read(first).isNull);
	CHECK(lib_software_serial::getNextByte(first).isNull);
}

static void scenarioStopListeningLeavesTheOtherListener() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> first =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);
	core_object::Object<lib_software_serial::SoftwareSerialPort> second =
		createPort(core_gpio::PIN_3, static_cast<core_gpio::Pin>(SECOND_RECEIVE_PIN));

	lib_software_serial::initialize(first, STANDARD_BAUD_RATE);
	lib_software_serial::startListening(second);
	lib_software_serial::stopListening(first);

	CHECK(stopReceiveCallCount == 1);
	CHECK(lib_software_serial::isListening(second));

	lib_software_serial::stopListening(second);
	CHECK(!lib_software_serial::isListening(second));
}

static void scenarioDelegatesOverflowAndStreamReads() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, STANDARD_BAUD_RATE);
	overflowFlag = true;

	CHECK(lib_software_serial::hasOverflowed(port));
	CHECK(lib_software_serial::readInteger(port) == 42);
	CHECK(readStreamIntegerCallCount == 1);
	CHECK(readStreamLineCallCount == 0);

	core_string::String line = lib_software_serial::readLine(port);
	CHECK(readStreamLineCallCount == 1);
	CHECK(line.c_str() != nullptr);

	lib_software_serial::stopListening(port);
	CHECK(lib_software_serial::readInteger(port) == 0);
	CHECK(readStreamIntegerCallCount == 1);
	CHECK(readStreamLineCallCount == 1);
}

static void scenarioInitializeRejectsUnsupportedBaudRate() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, UNSUPPORTED_BAUD_RATE);

	CHECK(openPortCallCount == 0);
	CHECK(startReceiveCallCount == 0);
	CHECK(!lib_software_serial::isListening(port));
}

static void scenarioTwoHandlesKeepIndependentTransmitPins() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> first =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);
	core_object::Object<lib_software_serial::SoftwareSerialPort> second =
		createPort(static_cast<core_gpio::Pin>(SECOND_TRANSMIT_PIN),
				   static_cast<core_gpio::Pin>(SECOND_RECEIVE_PIN));

	lib_software_serial::initialize(first, STANDARD_BAUD_RATE);
	lib_software_serial::initialize(second, STANDARD_BAUD_RATE);
	core_software_serial_hardware::storeReceivedByte(FIRST_VALUE);

	lib_software_serial::send(first, "A");
	lib_software_serial::send(second, "B");

	CHECK(sentByteCount == 2);
	CHECK(sentTransmitPins[0] == TRANSMIT_PIN);
	CHECK(sentTransmitPins[1] == SECOND_TRANSMIT_PIN);

	// Closing the first handle releases only its transmit pin and leaves the
	// second handle listening with its buffer intact.
	lib_software_serial::close(first);

	CHECK(!openTransmitPins[TRANSMIT_PIN]);
	CHECK(openTransmitPins[SECOND_TRANSMIT_PIN]);
	CHECK(lib_software_serial::isListening(second));
	CHECK(lib_software_serial::hasData(second));
}

static void scenarioClosingTheOwnerReleasesItsPinsAndBuffer() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, STANDARD_BAUD_RATE);
	core_software_serial_hardware::storeReceivedByte(FIRST_VALUE);

	lib_software_serial::close(port);

	CHECK(!openTransmitPins[TRANSMIT_PIN]);
	CHECK(!lib_software_serial::isListening(port));
	CHECK(!lib_software_serial::hasData(port));
}

static void scenarioClosesThePort() {
	resetDouble();
	core_object::Object<lib_software_serial::SoftwareSerialPort> port =
		createPort(core_gpio::PIN_3, core_gpio::PIN_2);

	lib_software_serial::initialize(port, STANDARD_BAUD_RATE);
	lib_software_serial::flushOutput(port);
	lib_software_serial::close(port);

	CHECK(closePortCallCount == 1);
	CHECK(!lib_software_serial::isListening(port));
}

int main() {
	scenarioInitializesAndClaimsTheReceiveLine();
	scenarioSendsTextAndLineTerminators();
	scenarioReadsNullWhenTheBufferIsEmpty();
	scenarioReadsWithoutConsumingOnPeek();
	scenarioOnlyTheListenerReads();
	scenarioStopListeningLeavesTheOtherListener();
	scenarioDelegatesOverflowAndStreamReads();
	scenarioInitializeRejectsUnsupportedBaudRate();
	scenarioTwoHandlesKeepIndependentTransmitPins();
	scenarioClosingTheOwnerReleasesItsPinsAndBuffer();
	scenarioClosesThePort();

	if (failures > 0) {
		printf("software-serial-library: %d failure(s)\n", failures);
		return 1;
	}

	printf("software-serial-library: all checks passed\n");
	return 0;
}
