#ifndef _E95_EEPROM_HARDWARE_H
#define _E95_EEPROM_HARDWARE_H

// STM32F103 (Blue Pill) has no internal EEPROM: RM0008 describes only the
// embedded Flash memory (section 3), with 1 KB pages erased and programmed
// through FLASH_CR/FLASH_AR. Emulating EEPROM on that Flash would require
// reserving a page outside the program image, erase-before-write for every
// changed byte (a whole page per update), a page-sized RAM shadow, and accepts
// a wear/latency cost that the byte API cannot hide. The library is therefore
// not supported on this target; see docs/api-coverage.md.
#error "EEPROM is not available on STM32F103: the MCU has no internal EEPROM (RM0008 section 3)."

#endif
