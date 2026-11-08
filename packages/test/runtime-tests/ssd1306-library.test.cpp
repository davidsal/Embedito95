// Host compile+behaviour guard for the *generated* ssd1306 library
// (src/arduino-nano/snapshots/engine/ssd1306/lib_ssd1306.cpp). The generated
// translation unit is compiled verbatim against recording doubles of
// core_i2c/core_spi (host/core_i2c.h, host/core_spi.h). The scenarios go
// through the public factory + method surface (getDisplayI2C/getDisplaySPI,
// initialize, write, clearDisplay), so a regression in sendCommand,
// positionCursor, the transport dispatcher or the write chunking is executed
// instead of only pinned by a snapshot. The ordered host event log
// (host/bus_event_log.h) proves that each SPI write happens between CS low and
// CS high. It also pins the SPI clock divider, which must stay below the panel
// limit.

#include <stdint.h>
#include <stdio.h>

#include <Arduino.h>
#include <bus_event_log.h>
#include <core_array.h>
#include <core_canvas.h>
#include <core_gpio.h>
#include <core_i2c.h>
#include <core_object.h>
#include <core_spi.h>
#include <core_string.h>

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static const uint8_t CHIP_SELECT_PIN = 10;
static const uint8_t DATA_COMMAND_PIN = 9;
static const uint8_t DISPLAY_ADDRESS = 60;
static const uint8_t CONTROL_COMMAND = 0;
static const uint8_t CONTROL_DATA = 64;
static const uint8_t LOW_LEVEL = 0;
static const uint8_t HIGH_LEVEL = 1;
static const uint8_t DISPLAY_OFF_COMMAND = 0xAE;
static const uint8_t DISPLAY_ON_COMMAND = 0xAF;
static const uint8_t PAGE_BASE_COMMAND = 0xB0;
static const uint8_t COLUMN_HIGH_BASE_COMMAND = 0x10;
static const uint8_t COLUMN_LOW_AFTER_FIVE_CHARACTERS = 14;
static const uint8_t COLUMN_HIGH_OFFSET_AFTER_FIVE_CHARACTERS = 1;
static const uint16_t EXPECTED_INIT_COMMAND_COUNT = 25;
static const uint16_t EXPECTED_I2C_COMMAND_PAYLOAD_LENGTH = 2;
static const uint16_t EXPECTED_I2C_CURSOR_PAYLOAD_LENGTH = 4;
static const uint16_t EXPECTED_I2C_DATA_PAYLOAD_LENGTH = 31;
static const uint16_t EXPECTED_I2C_REMAINDER_PAYLOAD_LENGTH = 7;
static const uint16_t EXPECTED_SPI_COMMAND_PAYLOAD_LENGTH = 1;
static const uint16_t EXPECTED_SPI_CURSOR_PAYLOAD_LENGTH = 3;
static const uint16_t EXPECTED_SPI_DATA_PAYLOAD_LENGTH = 30;
static const uint16_t EXPECTED_SPI_SINGLE_CHARACTER_PAYLOAD_LENGTH = 6;
static const uint16_t EXPECTED_SPI_CLEAR_REMAINDER_PAYLOAD_LENGTH = 8;
static const uint16_t EVENTS_PER_SPI_TRANSACTION = 4;
static const uint16_t EXPECTED_SINGLE_CHARACTER_EVENT_COUNT = 8;
static const uint16_t PAGE_COUNT = 8;
static const uint16_t CLEAR_DATA_CHUNK_COUNT = 4;
static const uint16_t CLEAR_TRANSACTIONS_PER_PAGE = CLEAR_DATA_CHUNK_COUNT + 2;
static const uint16_t EXPECTED_CLEAR_EVENT_COUNT =
	PAGE_COUNT * CLEAR_TRANSACTIONS_PER_PAGE * EVENTS_PER_SPI_TRANSACTION;
static const uint16_t EXPECTED_SPI_CLOCK_DIVIDER = 8;
static const char FIVE_CHARACTER_TEXT[] = "AAAAA";
static const char SIX_CHARACTER_TEXT[] = "AAAAAA";
static const char SINGLE_CHARACTER_TEXT[] = "A";

// Arduino digital surface the generated gpio header forwards to. The shared
// event log keeps the pin changes interleaved with the bus writes.
void pinMode(uint8_t pin, uint8_t mode) {
	(void)pin;
	(void)mode;
}

void digitalWrite(uint8_t pin, uint8_t value) {
	bus_event_log::recordDigitalWrite(pin, value);
}

int digitalRead(uint8_t pin) {
	(void)pin;
	return LOW_LEVEL;
}

int analogRead(uint8_t pin) {
	(void)pin;
	return 0;
}

void analogWrite(uint8_t pin, int value) {
	(void)pin;
	(void)value;
}

// The generated closure methods always receive the `self` handle, and the
// methods that only forward to the transport do not read any field from it.
// Keep the test compiled with -Werror without changing the shared codegen.
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-parameter"
#include "packages/test/src/arduino-nano/snapshots/engine/ssd1306/lib_ssd1306.cpp"
#pragma GCC diagnostic pop

static const bus_event_log::Event &getEvent(uint16_t index) {
	if (bus_event_log::eventCount == 0) {
		return bus_event_log::events[0];
	}
	if (index >= bus_event_log::eventCount) {
		return bus_event_log::events[bus_event_log::eventCount - 1];
	}
	return bus_event_log::events[index];
}

static uint16_t countBusEvents() {
	uint16_t count = 0;
	for (uint16_t index = 0; index < bus_event_log::eventCount; index++) {
		if (bus_event_log::events[index].kind == bus_event_log::BUS_EVENT) {
			count++;
		}
	}
	return count;
}

static const bus_event_log::Event *getBusEvent(uint16_t sequenceIndex) {
	uint16_t seen = 0;
	for (uint16_t index = 0; index < bus_event_log::eventCount; index++) {
		if (bus_event_log::events[index].kind != bus_event_log::BUS_EVENT) {
			continue;
		}
		if (seen == sequenceIndex) {
			return &bus_event_log::events[index];
		}
		seen++;
	}
	return nullptr;
}

static void checkI2cWrite(
	uint16_t sequenceIndex, uint8_t expectedControlByte, uint16_t expectedPayloadLength) {
	const bus_event_log::Event *event = getBusEvent(sequenceIndex);
	CHECK(event != nullptr);
	if (event == nullptr) {
		return;
	}
	CHECK(event->address == DISPLAY_ADDRESS);
	CHECK(event->payloadLength == expectedPayloadLength);
	CHECK(event->payload[0] == expectedControlByte);
}

static void checkSpiTransactionAt(
	uint16_t startIndex, uint8_t expectedDataCommandLevel, uint16_t expectedPayloadLength) {
	CHECK(startIndex + EVENTS_PER_SPI_TRANSACTION <= bus_event_log::eventCount);
	if (startIndex + EVENTS_PER_SPI_TRANSACTION > bus_event_log::eventCount) {
		return;
	}
	const bus_event_log::Event &chipSelectLow = getEvent(startIndex);
	const bus_event_log::Event &dataCommand = getEvent(startIndex + 1);
	const bus_event_log::Event &busWrite = getEvent(startIndex + 2);
	const bus_event_log::Event &chipSelectHigh = getEvent(startIndex + 3);

	CHECK(chipSelectLow.kind == bus_event_log::DIGITAL_EVENT);
	CHECK(chipSelectLow.pin == CHIP_SELECT_PIN);
	CHECK(chipSelectLow.level == LOW_LEVEL);
	CHECK(dataCommand.kind == bus_event_log::DIGITAL_EVENT);
	CHECK(dataCommand.pin == DATA_COMMAND_PIN);
	CHECK(dataCommand.level == expectedDataCommandLevel);
	CHECK(busWrite.kind == bus_event_log::BUS_EVENT);
	CHECK(busWrite.payloadLength == expectedPayloadLength);
	CHECK(chipSelectHigh.kind == bus_event_log::DIGITAL_EVENT);
	CHECK(chipSelectHigh.pin == CHIP_SELECT_PIN);
	CHECK(chipSelectHigh.level == HIGH_LEVEL);
}

static void checkI2cCommandPayload(
	uint16_t sequenceIndex, uint8_t expectedCommandByte) {
	const bus_event_log::Event *event = getBusEvent(sequenceIndex);
	CHECK(event != nullptr);
	if (event == nullptr) {
		return;
	}
	CHECK(event->payloadLength == EXPECTED_I2C_COMMAND_PAYLOAD_LENGTH);
	CHECK(event->payload[0] == CONTROL_COMMAND);
	CHECK(event->payload[1] == expectedCommandByte);
}

static void checkSpiCommandPayload(
	uint16_t sequenceIndex, uint8_t expectedCommandByte) {
	const bus_event_log::Event *event = getBusEvent(sequenceIndex);
	CHECK(event != nullptr);
	if (event == nullptr) {
		return;
	}
	CHECK(event->payloadLength == EXPECTED_SPI_COMMAND_PAYLOAD_LENGTH);
	CHECK(event->payload[0] == expectedCommandByte);
}

static void scenarioWritesTextThroughPublicI2cApi() {
	core_i2c::resetRecording();
	core_object::Object<lib_ssd1306::Ssd1306Display> display =
		lib_ssd1306::getDisplayI2C(core_i2c::I2C::I2C_1);

	lib_ssd1306::initialize(display);

	CHECK(core_i2c::recording.initializeCallCount == 1);
	CHECK(core_i2c::recording.writeCallCount == EXPECTED_INIT_COMMAND_COUNT);
	CHECK(countBusEvents() == EXPECTED_INIT_COMMAND_COUNT);
	for (uint16_t commandIndex = 0; commandIndex < EXPECTED_INIT_COMMAND_COUNT; commandIndex++) {
		const bus_event_log::Event *command = getBusEvent(commandIndex);
		CHECK(command != nullptr);
		if (command != nullptr) {
			CHECK(command->payloadLength == EXPECTED_I2C_COMMAND_PAYLOAD_LENGTH);
			CHECK(command->payload[0] == CONTROL_COMMAND);
		}
	}
	checkI2cCommandPayload(0, DISPLAY_OFF_COMMAND);
	checkI2cCommandPayload(EXPECTED_INIT_COMMAND_COUNT - 1, DISPLAY_ON_COMMAND);

	core_i2c::resetRecording();
	lib_ssd1306::write(display, core_string::String(FIVE_CHARACTER_TEXT));

	// A five-character row is exactly one 30-byte data chunk, so the public
	// path emits one cursor command write and one 31-byte data write
	// (control byte 0x40 + 30 data bytes).
	CHECK(core_i2c::recording.writeCallCount == 2);
	checkI2cWrite(0, CONTROL_COMMAND, EXPECTED_I2C_CURSOR_PAYLOAD_LENGTH);
	checkI2cWrite(1, CONTROL_DATA, EXPECTED_I2C_DATA_PAYLOAD_LENGTH);
	const bus_event_log::Event *firstCursor = getBusEvent(0);
	if (firstCursor != nullptr) {
		CHECK(firstCursor->payload[1] == PAGE_BASE_COMMAND);
		CHECK(firstCursor->payload[2] == 0);
		CHECK(firstCursor->payload[3] == COLUMN_HIGH_BASE_COMMAND);
	}

	core_i2c::resetRecording();
	lib_ssd1306::write(display, core_string::String(SIX_CHARACTER_TEXT));

	// Six characters are 36 bytes: one full 30-byte chunk plus a 6-byte
	// remainder. The cursor moved to column 30 after the previous write, which
	// also exercises positionCursor through the public `write`.
	CHECK(core_i2c::recording.writeCallCount == 3);
	CHECK(countBusEvents() == 3);
	checkI2cWrite(0, CONTROL_COMMAND, EXPECTED_I2C_CURSOR_PAYLOAD_LENGTH);
	checkI2cWrite(1, CONTROL_DATA, EXPECTED_I2C_DATA_PAYLOAD_LENGTH);
	checkI2cWrite(2, CONTROL_DATA, EXPECTED_I2C_REMAINDER_PAYLOAD_LENGTH);
	const bus_event_log::Event *movedCursor = getBusEvent(0);
	if (movedCursor != nullptr) {
		CHECK(movedCursor->payload[1] == PAGE_BASE_COMMAND);
		CHECK(movedCursor->payload[2] == COLUMN_LOW_AFTER_FIVE_CHARACTERS);
		CHECK(movedCursor->payload[3] ==
			  (uint8_t)(COLUMN_HIGH_BASE_COMMAND + COLUMN_HIGH_OFFSET_AFTER_FIVE_CHARACTERS));
	}
}

static void scenarioInitializesSpiThroughPublicApi() {
	core_spi::resetRecording();
	core_object::Object<lib_ssd1306::Ssd1306Display> display =
		lib_ssd1306::getDisplaySPI(
			core_spi::SPI::SPI_1,
			(core_gpio::Pin)CHIP_SELECT_PIN,
			(core_gpio::Pin)DATA_COMMAND_PIN);

	lib_ssd1306::initialize(display);

	CHECK(core_spi::recording.initializeCallCount == 1);
	CHECK(core_spi::recording.clockMode == core_spi::MODE_0);
	CHECK(core_spi::recording.bitOrder == core_spi::MSB_FIRST);
	CHECK(core_spi::recording.clockDivider == EXPECTED_SPI_CLOCK_DIVIDER);
	CHECK(core_spi::recording.writeCallCount == EXPECTED_INIT_COMMAND_COUNT);
	CHECK(countBusEvents() == EXPECTED_INIT_COMMAND_COUNT);

	// The transport leaves CS high at rest before the command stream.
	CHECK(getEvent(0).kind == bus_event_log::DIGITAL_EVENT);
	CHECK(getEvent(0).pin == CHIP_SELECT_PIN);
	CHECK(getEvent(0).level == HIGH_LEVEL);

	for (uint16_t commandIndex = 0; commandIndex < EXPECTED_INIT_COMMAND_COUNT; commandIndex++) {
		checkSpiTransactionAt(
			1 + commandIndex * EVENTS_PER_SPI_TRANSACTION,
			LOW_LEVEL,
			EXPECTED_SPI_COMMAND_PAYLOAD_LENGTH);
	}
	checkSpiCommandPayload(0, DISPLAY_OFF_COMMAND);
	checkSpiCommandPayload(EXPECTED_INIT_COMMAND_COUNT - 1, DISPLAY_ON_COMMAND);
}

static void scenarioWritesAndClearsThroughPublicSpiApi() {
	core_spi::resetRecording();
	core_object::Object<lib_ssd1306::Ssd1306Display> display =
		lib_ssd1306::getDisplaySPI(
			core_spi::SPI::SPI_1,
			(core_gpio::Pin)CHIP_SELECT_PIN,
			(core_gpio::Pin)DATA_COMMAND_PIN);
	lib_ssd1306::initialize(display);

	core_spi::resetRecording();
	lib_ssd1306::write(display, core_string::String(SINGLE_CHARACTER_TEXT));

	CHECK(core_spi::recording.writeCallCount == 2);
	CHECK(bus_event_log::eventCount == EXPECTED_SINGLE_CHARACTER_EVENT_COUNT);
	checkSpiTransactionAt(0, LOW_LEVEL, EXPECTED_SPI_CURSOR_PAYLOAD_LENGTH);
	checkSpiTransactionAt(
		EVENTS_PER_SPI_TRANSACTION, HIGH_LEVEL, EXPECTED_SPI_SINGLE_CHARACTER_PAYLOAD_LENGTH);
	const bus_event_log::Event *cursor = getBusEvent(0);
	if (cursor != nullptr) {
		CHECK(cursor->payload[0] == PAGE_BASE_COMMAND);
	}

	core_spi::resetRecording();
	lib_ssd1306::clearDisplay(display);

	CHECK(core_spi::recording.writeCallCount ==
		  PAGE_COUNT * CLEAR_TRANSACTIONS_PER_PAGE);
	CHECK(bus_event_log::eventCount == EXPECTED_CLEAR_EVENT_COUNT);
	for (uint16_t page = 0; page < PAGE_COUNT; page++) {
		const uint16_t pageStartEvent =
			page * CLEAR_TRANSACTIONS_PER_PAGE * EVENTS_PER_SPI_TRANSACTION;
		checkSpiTransactionAt(pageStartEvent, LOW_LEVEL, EXPECTED_SPI_CURSOR_PAYLOAD_LENGTH);
		const bus_event_log::Event *pageCursor =
			getBusEvent(page * CLEAR_TRANSACTIONS_PER_PAGE);
		if (pageCursor != nullptr) {
			CHECK(pageCursor->payload[0] == (uint8_t)(PAGE_BASE_COMMAND + page));
			CHECK(pageCursor->payload[1] == 0);
			CHECK(pageCursor->payload[2] == COLUMN_HIGH_BASE_COMMAND);
		}
		for (uint16_t chunkIndex = 0; chunkIndex < CLEAR_DATA_CHUNK_COUNT; chunkIndex++) {
			checkSpiTransactionAt(
				pageStartEvent + (chunkIndex + 1) * EVENTS_PER_SPI_TRANSACTION,
				HIGH_LEVEL,
				EXPECTED_SPI_DATA_PAYLOAD_LENGTH);
		}
		checkSpiTransactionAt(
			pageStartEvent + (CLEAR_DATA_CHUNK_COUNT + 1) * EVENTS_PER_SPI_TRANSACTION,
			HIGH_LEVEL,
			EXPECTED_SPI_CLEAR_REMAINDER_PAYLOAD_LENGTH);
	}
}

int main() {
	scenarioWritesTextThroughPublicI2cApi();
	scenarioInitializesSpiThroughPublicApi();
	scenarioWritesAndClearsThroughPublicSpiApi();

	if (failures != 0) {
		printf("FAIL %d ssd1306 library check(s)\n", failures);
		return 1;
	}
	printf("PASS ssd1306 public I2C/SPI library surface\n");
	return 0;
}
