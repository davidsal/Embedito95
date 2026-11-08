#ifndef _E95_CODEGEN_RUN_HOST_SPI_H
#define _E95_CODEGEN_RUN_HOST_SPI_H
// Host stand-in for the AVR `SPI.h` used by the codegen-run project. The
// generated `core_spi.h` names the legacy AVR entry points and constants, so
// this header mirrors that surface exactly; it does not emulate a bus, because
// the codegen-run scenarios assert the generated call sequence, not the SPI
// wire protocol (the runtime-tests compile the same header against a fake bus).
#include <stdint.h>

#define SPI_CLOCK_DIV4 0x00
#define SPI_CLOCK_DIV16 0x01
#define SPI_CLOCK_DIV64 0x02
#define SPI_CLOCK_DIV128 0x03
#define SPI_CLOCK_DIV2 0x04
#define SPI_CLOCK_DIV8 0x05
#define SPI_CLOCK_DIV32 0x06

#define SPI_MODE0 0x00
#define SPI_MODE1 0x04
#define SPI_MODE2 0x08
#define SPI_MODE3 0x0C

#define MSBFIRST 1
#define LSBFIRST 0

class SPIClass {
public:
	void begin() {}

	void end() {}

	void setClockDivider(uint8_t divider) {
		(void)divider;
	}

	void setBitOrder(uint8_t order) {
		(void)order;
	}

	void setDataMode(uint8_t mode) {
		(void)mode;
	}

	uint8_t transfer(uint8_t data) {
		return data;
	}
};

inline SPIClass SPI;

#endif
