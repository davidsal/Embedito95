#ifndef _E95_RUNTIME_HOST_SPI_H
#define _E95_RUNTIME_HOST_SPI_H
// Host stand-in for the platform `SPI.h` (ArduinoCore-avr surface), used by the
// runtime test that compiles the real arduino SPI header. It mirrors the AVR
// library symbol by symbol for the slice the emitted header uses: the legacy
// `setClockDivider`/`setBitOrder`/`setDataMode` entry points and their real
// constants (`SPI_CLOCK_DIV*`, `SPI_MODE*`, `MSBFIRST`/`LSBFIRST`), plus
// `transfer(uint8_t)`. The names/values match the AVR macros so a wrong or
// invented symbol in the emitted driver fails to compile here.
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
	SPIClass()
		: clockDivider(SPI_CLOCK_DIV4),
			bitOrder(MSBFIRST),
			dataMode(SPI_MODE0),
			transferCount(0),
			endCount(0),
			sentByteCount(0) {}

	void begin() {}

	void end() {
		endCount++;
	}

	void setClockDivider(uint8_t divider) {
		clockDivider = divider;
	}

	void setBitOrder(uint8_t order) {
		bitOrder = order;
	}

	void setDataMode(uint8_t mode) {
		dataMode = mode;
	}

	uint8_t transfer(uint8_t data) {
		transferCount++;
		if (sentByteCount < SENT_BYTE_CAPACITY) {
			sentBytes[sentByteCount] = data;
			sentByteCount++;
		}
		return data;
	}

	static const uint8_t SENT_BYTE_CAPACITY = 2;

	uint8_t clockDivider;
	uint8_t bitOrder;
	uint8_t dataMode;
	uint16_t transferCount;
	uint16_t endCount;
	uint8_t sentBytes[SENT_BYTE_CAPACITY];
	uint8_t sentByteCount;
};

#endif
