#ifndef LIB_EEPROM_H
#define LIB_EEPROM_H

// CORE
#include <core_eeprom_hardware.h>
#include <core_system.h>
#include <core_type.h>

namespace lib_eeprom {

const u8 UNWRITTEN_CELL = 255;
const u32 MAXIMUM_CELL_ADDRESS = 65535;

u16 getCapacity();
u8 readEepromByte(u16 address);
void writeEepromByte(u16 address, u8 value);
void updateEepromByte(u16 address, u8 value);
core_array::Array<u8> readEepromBlock(u16 address, u16 length);
void writeEepromBlock(u16 address, core_array::Array<u8> data);

}

#endif