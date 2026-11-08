// CORE
#include "core/eeprom_hardware/core_eeprom_hardware.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
// LIBRARIES
#include "libraries/eeprom/lib_eeprom.h"

const u16 CONFIGURATION_CELL = 0;
const u8 CONFIGURATION_VALUE = 42;
const u8 ALTERNATE_VALUE = 7;
const u16 CONFIGURATION_LENGTH = 2;
const u16 EMPTY_LENGTH = 0;

int main() {
	// SETUP
	initializeSystemClock();
	lib_eeprom::writeEepromByte(CONFIGURATION_CELL, CONFIGURATION_VALUE);

	// MAIN
	lib_eeprom::updateEepromByte(CONFIGURATION_CELL, CONFIGURATION_VALUE);
	if (lib_eeprom::readEepromByte(CONFIGURATION_CELL) == CONFIGURATION_VALUE) {
		lib_eeprom::updateEepromByte(CONFIGURATION_CELL, ALTERNATE_VALUE);
	}
	lib_eeprom::writeEepromByte(lib_eeprom::getCapacity(), CONFIGURATION_VALUE);
	lib_eeprom::writeEepromByte(((i32)(lib_eeprom::getCapacity()) - (i32)(1)), ALTERNATE_VALUE);
	core_array::Array<u8> configuration = { CONFIGURATION_VALUE, ALTERNATE_VALUE };
	lib_eeprom::writeEepromBlock(CONFIGURATION_CELL, configuration);
	core_array::Array<u8> block = lib_eeprom::readEepromBlock(CONFIGURATION_CELL, CONFIGURATION_LENGTH);
	lib_eeprom::writeEepromBlock(((i32)(lib_eeprom::getCapacity()) - (i32)(1)), block);

	core_array::Array<u8> empty = lib_eeprom::readEepromBlock(CONFIGURATION_CELL, EMPTY_LENGTH);
	lib_eeprom::writeEepromBlock(CONFIGURATION_CELL, empty);

	core_array::Array<u8> clipped = lib_eeprom::readEepromBlock(((i32)(lib_eeprom::getCapacity()) - (i32)(1)), CONFIGURATION_LENGTH);
	lib_eeprom::writeEepromBlock(lib_eeprom::getCapacity(), clipped);
}
