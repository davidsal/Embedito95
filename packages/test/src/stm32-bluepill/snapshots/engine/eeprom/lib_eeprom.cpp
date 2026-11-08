#include "lib_eeprom.h"

namespace lib_eeprom {

u16 getCapacity() {
	return core_eeprom_hardware::getCellCount();
}

u8 readEepromByte(u16 address) {
	return core_eeprom_hardware::readCell(address);
}

void writeEepromByte(u16 address, u8 value) {
	core_eeprom_hardware::writeCell(address, value);
}

void updateEepromByte(u16 address, u8 value) {
	core_eeprom_hardware::updateCell(address, value);
}

core_array::Array<u8> readEepromBlock(u16 address, u16 length) {
	core_array::Array<u8> bytes;
	for (u16 offset = 0; offset < length; offset += 1) {
		const u32 cellAddress = ((u32)(address)) + (u32)(offset);
		if (cellAddress > MAXIMUM_CELL_ADDRESS) {
			bytes.push(UNWRITTEN_CELL);
		} else {
			bytes.push(core_eeprom_hardware::readCell((u16)(cellAddress)));
		}
	}
	return bytes;
}

void writeEepromBlock(u16 address, core_array::Array<u8> data) {
	for (u16 offset = 0; offset < data.length(); offset += 1) {
		const u32 cellAddress = ((u32)(address)) + (u32)(offset);
		if (cellAddress > MAXIMUM_CELL_ADDRESS) {
			return;
		}
		core_eeprom_hardware::writeCell((u16)(cellAddress), data[offset]);
	}
}

}