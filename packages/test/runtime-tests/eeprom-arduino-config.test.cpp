// Host compile+behaviour guard for the generated AVR EEPROM helper
// (src/arduino-nano/snapshots/engine/eeprom_hardware/core_eeprom_hardware.h)
// and the generated library on top of it
// (src/arduino-nano/snapshots/engine/eeprom/lib_eeprom.cpp). They are included
// verbatim against the AVR-like register surface in host/avr/io.h, so a
// regression in the register names, the EEARH:EEARL address split, the EERE
// read sequence, the EEMPE/EEPE write sequence, the update-only-if-changed
// rule or the block clipping/length-zero rules fails here, exactly where the
// device would.

#include <stdint.h>
#include <stdio.h>

#include <avr/io.h>
#include <core_array.h>
#include <core_eeprom_hardware.h>

static const uint16_t EEPROM_CELL_COUNT = 1024;
static const uint8_t UNWRITTEN_CELL = 0xFF;
static const uint16_t FIRST_CELL = 0;
static const uint16_t LAST_CELL = 1023;
static const uint16_t OUT_OF_RANGE_CELL = 1024;
static const uint16_t MAXIMUM_CELL_ADDRESS = 65535;
static const uint8_t FIRST_VALUE = 0x5A;
static const uint8_t SECOND_VALUE = 0x33;
static const uint8_t THIRD_VALUE = 0x44;
static const uint16_t BLOCK_LENGTH = 3;
static const uint16_t CLIPPED_BLOCK_LENGTH = 4;
static const uint16_t EMPTY_BLOCK_LENGTH = 0;
static const uint32_t NO_WRITE = 0;
static const uint32_t ONE_WRITE = 1;
static const uint32_t BUSY_WRITE_POLLS = 3;
static const uint32_t MAXIMUM_LOGGED_EVENTS = 8;

static const uint8_t EVENT_MASTER_ENABLE = 1;
static const uint8_t EVENT_PROGRAM = 2;
static const uint8_t EVENT_PROGRAM_WITHOUT_MASTER_ENABLE = 3;

uint8_t eepromHostCells[EEPROM_CELL_COUNT];
uint32_t eepromHostWriteCount = 0;
uint32_t eepromHostMasterEnableCount = 0;
uint32_t eepromHostProgramCount = 0;
uint8_t eepromHostEvents[MAXIMUM_LOGGED_EVENTS];
uint32_t eepromHostEventCount = 0;
bool eepromHostMasterEnablePending = false;

volatile EepromControlRegister EECR = {0};
volatile uint8_t EEDR = 0;
volatile uint8_t EEARL = 0;
volatile uint8_t EEARH = 0;

volatile uint8_t SREG = 0;

static uint16_t selectedCellAddress() {
	return (uint16_t)(((uint16_t)EEARH << 8) | EEARL);
}

static void recordEepromEvent(uint8_t event) {
	if (eepromHostEventCount < MAXIMUM_LOGGED_EVENTS) {
		eepromHostEvents[eepromHostEventCount] = event;
	}
	eepromHostEventCount++;
}

// Host model of the EEPROM control register. EEPE only completes the store
// when an EEMPE was requested first; an out-of-order EEPE is ignored (as the
// datasheet requires), which makes an inverted EEMPE/EEPE sequence fail the
// behaviour and ordering checks below instead of silently writing the cell.
volatile EepromControlRegister &EepromControlRegister::operator|=(
	uint8_t mask) volatile {
	if ((mask & (uint8_t)_BV(EERE)) != 0) {
		EEDR = eepromHostCells[selectedCellAddress()];
		bits = (uint8_t)(bits & (uint8_t)~_BV(EERE));
	}

	if ((mask & (uint8_t)_BV(EEMPE)) != 0) {
		bits = (uint8_t)(bits | _BV(EEMPE));
		eepromHostMasterEnablePending = true;
		eepromHostMasterEnableCount++;
		recordEepromEvent(EVENT_MASTER_ENABLE);
	}

	if ((mask & (uint8_t)_BV(EEPE)) != 0) {
		if (eepromHostMasterEnablePending) {
			bits = (uint8_t)(bits | _BV(EEPE));
			eepromHostCells[selectedCellAddress()] = EEDR;
			eepromHostWriteCount++;
			eepromHostProgramCount++;
			recordEepromEvent(EVENT_PROGRAM);
			bits = (uint8_t)(bits & (uint8_t)~(_BV(EEPE) | _BV(EEMPE)));
			eepromHostMasterEnablePending = false;
		} else {
			recordEepromEvent(EVENT_PROGRAM_WITHOUT_MASTER_ENABLE);
		}
	}

	return *this;
}

#include "packages/test/src/arduino-nano/snapshots/engine/eeprom/lib_eeprom.cpp"

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void resetEeprom() {
	for (uint16_t address = 0; address < EEPROM_CELL_COUNT; address++) {
		eepromHostCells[address] = UNWRITTEN_CELL;
	}
	eepromHostWriteCount = NO_WRITE;
	eepromHostMasterEnableCount = 0;
	eepromHostProgramCount = 0;
	eepromHostEventCount = 0;
	eepromHostMasterEnablePending = false;
	eepromHostBusyPollsRemaining = 0;
	eepromHostControlRegisterReadCount = 0;
	EECR = 0;
	EEDR = 0;
	EEARL = 0;
	EEARH = 0;
	SREG = (uint8_t)_BV(SREG_I);
}

static core_array::Array<u8> makeBlock(const uint8_t *values, uint16_t length) {
	core_array::Array<u8> block;
	for (uint16_t index = 0; index < length; index++) {
		block.push(values[index]);
	}
	return block;
}

static void scenarioReportsTheAtmega328pCapacity() {
	resetEeprom();
	CHECK(core_eeprom_hardware::getCellCount() == EEPROM_CELL_COUNT);
}

static void scenarioReadsAnUnwrittenCellAsAllOnes() {
	resetEeprom();
	CHECK(core_eeprom_hardware::readCell(FIRST_CELL) == UNWRITTEN_CELL);
	CHECK(core_eeprom_hardware::readCell(LAST_CELL) == UNWRITTEN_CELL);
}

static void scenarioWritesAndReadsBackBothAddressBytes() {
	resetEeprom();

	core_eeprom_hardware::writeCell(FIRST_CELL, FIRST_VALUE);
	core_eeprom_hardware::writeCell(LAST_CELL, SECOND_VALUE);

	CHECK(eepromHostCells[FIRST_CELL] == FIRST_VALUE);
	CHECK(eepromHostCells[LAST_CELL] == SECOND_VALUE);
	CHECK(core_eeprom_hardware::readCell(FIRST_CELL) == FIRST_VALUE);
	CHECK(core_eeprom_hardware::readCell(LAST_CELL) == SECOND_VALUE);
	CHECK(eepromHostWriteCount == 2);
	CHECK(EEARH == (uint8_t)(LAST_CELL >> 8));
	CHECK(EEARL == (uint8_t)(LAST_CELL & 0xFF));
}

static void scenarioWriteUsesTheMasterEnableThenProgramSequence() {
	resetEeprom();

	core_eeprom_hardware::writeCell(FIRST_CELL, FIRST_VALUE);

	CHECK(eepromHostMasterEnableCount == ONE_WRITE);
	CHECK(eepromHostProgramCount == ONE_WRITE);
	CHECK(eepromHostEventCount == 2);
	CHECK(eepromHostEvents[0] == EVENT_MASTER_ENABLE);
	CHECK(eepromHostEvents[1] == EVENT_PROGRAM);
	CHECK((EECR & (uint8_t)_BV(EEPE)) == 0);
	CHECK(SREG == (uint8_t)_BV(SREG_I));
}

static void scenarioWaitsForAnInProgressWriteBeforeProgramming() {
	resetEeprom();
	EECR = (uint8_t)_BV(EEPE);
	eepromHostBusyPollsRemaining = BUSY_WRITE_POLLS;

	core_eeprom_hardware::writeCell(FIRST_CELL, FIRST_VALUE);

	CHECK(eepromHostControlRegisterReadCount >= BUSY_WRITE_POLLS);
	CHECK(eepromHostCells[FIRST_CELL] == FIRST_VALUE);
	CHECK(eepromHostWriteCount == ONE_WRITE);
	CHECK(eepromHostEvents[0] == EVENT_MASTER_ENABLE);
	CHECK(eepromHostEvents[1] == EVENT_PROGRAM);
}

static void scenarioUpdateSkipsAnUnchangedValue() {
	resetEeprom();

	core_eeprom_hardware::writeCell(FIRST_CELL, SECOND_VALUE);
	CHECK(eepromHostWriteCount == ONE_WRITE);

	core_eeprom_hardware::updateCell(FIRST_CELL, SECOND_VALUE);
	CHECK(eepromHostWriteCount == ONE_WRITE);
	CHECK(core_eeprom_hardware::readCell(FIRST_CELL) == SECOND_VALUE);

	core_eeprom_hardware::updateCell(FIRST_CELL, THIRD_VALUE);
	CHECK(eepromHostWriteCount == 2);
	CHECK(core_eeprom_hardware::readCell(FIRST_CELL) == THIRD_VALUE);
}

static void scenarioOutOfRangeAccessIsSafe() {
	resetEeprom();

	CHECK(core_eeprom_hardware::readCell(OUT_OF_RANGE_CELL) == UNWRITTEN_CELL);
	CHECK(core_eeprom_hardware::readCell(MAXIMUM_CELL_ADDRESS) == UNWRITTEN_CELL);

	core_eeprom_hardware::writeCell(OUT_OF_RANGE_CELL, FIRST_VALUE);
	core_eeprom_hardware::updateCell(OUT_OF_RANGE_CELL, FIRST_VALUE);

	CHECK(eepromHostWriteCount == NO_WRITE);
	CHECK(core_eeprom_hardware::readCell(FIRST_CELL) == UNWRITTEN_CELL);
}

static void scenarioReadsACompleteBlock() {
	resetEeprom();

	const uint8_t values[] = {FIRST_VALUE, SECOND_VALUE, THIRD_VALUE};
	const core_array::Array<u8> written = makeBlock(values, BLOCK_LENGTH);
	lib_eeprom::writeEepromBlock(FIRST_CELL, written);
	const core_array::Array<u8> block =
		lib_eeprom::readEepromBlock(FIRST_CELL, BLOCK_LENGTH);

	CHECK(block.length() == BLOCK_LENGTH);
	CHECK(block[0] == FIRST_VALUE);
	CHECK(block[1] == SECOND_VALUE);
	CHECK(block[2] == THIRD_VALUE);
	CHECK(eepromHostWriteCount == BLOCK_LENGTH);
}

static void scenarioReadsAnEmptyBlockWithoutTouchingTheHardware() {
	resetEeprom();

	const core_array::Array<u8> block =
		lib_eeprom::readEepromBlock(FIRST_CELL, EMPTY_BLOCK_LENGTH);
	const uint8_t values[] = {FIRST_VALUE};
	lib_eeprom::writeEepromBlock(
		FIRST_CELL,
		makeBlock(values, EMPTY_BLOCK_LENGTH));

	CHECK(block.length() == EMPTY_BLOCK_LENGTH);
	CHECK(eepromHostWriteCount == NO_WRITE);
	CHECK(eepromHostMasterEnableCount == NO_WRITE);
	CHECK(eepromHostControlRegisterReadCount == NO_WRITE);
	CHECK(eepromHostCells[FIRST_CELL] == UNWRITTEN_CELL);
}

static void scenarioClipsABlockThatCrossesTheEndOfTheStorage() {
	resetEeprom();

	const uint8_t values[] = {FIRST_VALUE, SECOND_VALUE, THIRD_VALUE};
	lib_eeprom::writeEepromBlock(LAST_CELL - 1, makeBlock(values, BLOCK_LENGTH));

	CHECK(eepromHostCells[LAST_CELL - 1] == FIRST_VALUE);
	CHECK(eepromHostCells[LAST_CELL] == SECOND_VALUE);
	CHECK(eepromHostWriteCount == 2);
	CHECK(eepromHostCells[FIRST_CELL] == UNWRITTEN_CELL);

	const core_array::Array<u8> block =
		lib_eeprom::readEepromBlock(LAST_CELL - 1, CLIPPED_BLOCK_LENGTH);

	CHECK(block.length() == CLIPPED_BLOCK_LENGTH);
	CHECK(block[0] == FIRST_VALUE);
	CHECK(block[1] == SECOND_VALUE);
	CHECK(block[2] == UNWRITTEN_CELL);
	CHECK(block[3] == UNWRITTEN_CELL);
}

static void scenarioOutOfRangeBlocksAreSafe() {
	resetEeprom();
	core_eeprom_hardware::writeCell(FIRST_CELL, FIRST_VALUE);
	eepromHostWriteCount = NO_WRITE;

	const uint8_t values[] = {SECOND_VALUE, THIRD_VALUE, FIRST_VALUE};
	lib_eeprom::writeEepromBlock(
		OUT_OF_RANGE_CELL,
		makeBlock(values, BLOCK_LENGTH));
	lib_eeprom::writeEepromBlock(
		MAXIMUM_CELL_ADDRESS,
		makeBlock(values, BLOCK_LENGTH));

	CHECK(eepromHostWriteCount == NO_WRITE);
	CHECK(eepromHostCells[FIRST_CELL] == FIRST_VALUE);

	const core_array::Array<u8> outOfRange =
		lib_eeprom::readEepromBlock(OUT_OF_RANGE_CELL, BLOCK_LENGTH);
	CHECK(outOfRange.length() == BLOCK_LENGTH);
	CHECK(outOfRange[0] == UNWRITTEN_CELL);
	CHECK(outOfRange[1] == UNWRITTEN_CELL);
	CHECK(outOfRange[2] == UNWRITTEN_CELL);

	const core_array::Array<u8> pastAddressRange =
		lib_eeprom::readEepromBlock(MAXIMUM_CELL_ADDRESS, BLOCK_LENGTH);
	CHECK(pastAddressRange.length() == BLOCK_LENGTH);
	CHECK(pastAddressRange[0] == UNWRITTEN_CELL);
	CHECK(pastAddressRange[1] == UNWRITTEN_CELL);
	CHECK(pastAddressRange[2] == UNWRITTEN_CELL);
	CHECK(eepromHostCells[FIRST_CELL] == FIRST_VALUE);
}

int main() {
	scenarioReportsTheAtmega328pCapacity();
	scenarioReadsAnUnwrittenCellAsAllOnes();
	scenarioWritesAndReadsBackBothAddressBytes();
	scenarioWriteUsesTheMasterEnableThenProgramSequence();
	scenarioWaitsForAnInProgressWriteBeforeProgramming();
	scenarioUpdateSkipsAnUnchangedValue();
	scenarioOutOfRangeAccessIsSafe();
	scenarioReadsACompleteBlock();
	scenarioReadsAnEmptyBlockWithoutTouchingTheHardware();
	scenarioClipsABlockThatCrossesTheEndOfTheStorage();
	scenarioOutOfRangeBlocksAreSafe();

	if (failures == 0) {
		printf("EEPROM arduino config: all scenarios passed\n");
		return 0;
	}
	printf("EEPROM arduino config: %d check(s) failed\n", failures);
	return 1;
}
