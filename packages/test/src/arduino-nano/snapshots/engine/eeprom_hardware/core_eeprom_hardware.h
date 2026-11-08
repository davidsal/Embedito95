#ifndef _E95_EEPROM_HARDWARE_H
#define _E95_EEPROM_HARDWARE_H

#include <avr/io.h>
#include <core_type.h>

namespace core_eeprom_hardware {

// ATmega328P (Nano/Uno): 1 KB of in-system EEPROM, addressed by EEARH:EEARL.
// Datasheet section 8.2 and `avr/iom328p.h` (EEAR is a 16-bit SFR at 0x21).
const u16 CELL_COUNT = 1024;

// Erased or never-written EEPROM cells read back as all ones.
const u8 UNWRITTEN_CELL = 0xFF;

// The 10 address bits of the ATmega328P EEPROM address register.
const u16 ADDRESS_MASK = 0x03FF;
const u8 ADDRESS_LOW_MASK = 0xFF;
const u8 ADDRESS_HIGH_SHIFT = 8;

constexpr bool isCellAddress(u16 address) {
	return (address & (u16)~ADDRESS_MASK) == 0;
}

inline void waitForReady() {
	while ((EECR & _BV(EEPE)) != 0) {
	}
}

inline void selectCell(u16 address) {
	EEARL = (u8)(address & ADDRESS_LOW_MASK);
	EEARH = (u8)(address >> ADDRESS_HIGH_SHIFT);
}

inline u8 readCell(u16 address) {
	if (!isCellAddress(address)) {
		return UNWRITTEN_CELL;
	}
	waitForReady();
	selectCell(address);
	EECR |= _BV(EERE);
	return EEDR;
}

// The datasheet requires EEMPE and EEPE to be written within four cycles, so
// the two stores run with interrupts disabled. `EECR` is volatile, which keeps
// the stores in program order.
inline void startWrite() {
	const u8 savedInterruptState = SREG;
	SREG = (u8)(savedInterruptState & (u8)~_BV(SREG_I));
	EECR |= _BV(EEMPE);
	EECR |= _BV(EEPE);
	SREG = savedInterruptState;
}

inline void writeCell(u16 address, u8 value) {
	if (!isCellAddress(address)) {
		return;
	}
	waitForReady();
	selectCell(address);
	EEDR = value;
	startWrite();
	// A write takes about 8.5 ms on the ATmega328P. Blocking here makes the
	// next register access safe and the new value immediately observable.
	waitForReady();
}

inline void updateCell(u16 address, u8 value) {
	if (!isCellAddress(address)) {
		return;
	}
	if (readCell(address) == value) {
		return;
	}
	writeCell(address, value);
}

inline u16 getCellCount() {
	return CELL_COUNT;
}

} // namespace core_eeprom_hardware

#endif
