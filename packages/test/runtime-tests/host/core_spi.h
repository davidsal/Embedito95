#ifndef _E95_RUNTIME_HOST_CORE_SPI_H
#define _E95_RUNTIME_HOST_CORE_SPI_H
// Host stand-in for the generated `core_spi.h`. It exposes the surface a
// generated library uses (`getSPI`, clock settings and block writes), keeps the
// last clock configuration and records every block write in the shared ordered
// event log, so runtime tests can assert the SPI framing without a real bus.
#include <Arduino.h>
#include <bus_event_log.h>
#include <core_array.h>

namespace core_spi {

typedef enum : u8 {
	SPI_1 = 1,
	SPI_2 = 2
} SPI;

typedef enum : u8 {
	MODE_0 = 0,
	MODE_1 = 1,
	MODE_2 = 2,
	MODE_3 = 3
} SpiClockMode;

typedef enum : u8 {
	MSB_FIRST = 0,
	LSB_FIRST = 1
} SpiBitOrder;

struct Recording {
	u16 writeCallCount;
	u16 initializeCallCount;
	u16 endCallCount;
	u16 beginTransactionCallCount;
	u16 endTransactionCallCount;
	u16 clockDivider;
	SpiClockMode clockMode;
	SpiBitOrder bitOrder;

	Recording()
		: writeCallCount(0)
		, initializeCallCount(0)
		, endCallCount(0)
		, beginTransactionCallCount(0)
		, endTransactionCallCount(0)
		, clockDivider(0)
		, clockMode(MODE_0)
		, bitOrder(MSB_FIRST) {}
};

inline Recording recording;

inline void resetRecording() {
	recording = Recording();
	bus_event_log::reset();
}

struct SpiBus {
	void initialize() {
		recording.initializeCallCount++;
	}

	void close() {
		recording.endCallCount++;
	}

	u8 transfer(u8 data) {
		return data;
	}

	u16 transfer16(u16 value) {
		return value;
	}

	void beginTransaction(u16 divider, SpiClockMode mode, SpiBitOrder order) {
		recording.beginTransactionCallCount++;
		setClockDivider(divider);
		setClockMode(mode);
		setBitOrder(order);
	}

	void endTransaction() {
		recording.endTransactionCallCount++;
	}

	void setClockMode(SpiClockMode mode) {
		recording.clockMode = mode;
	}

	void setBitOrder(SpiBitOrder order) {
		recording.bitOrder = order;
	}

	void setClockDivider(u16 divider) {
		recording.clockDivider = divider;
	}

	void write(const core_array::Array<u8> &bytes) {
		recording.writeCallCount++;
		bus_event_log::recordBusWrite(bus_event_log::NO_ADDRESS, bytes);
	}
};

inline SpiBus getSPI(SPI channel) {
	(void)channel;
	return SpiBus();
}

} // namespace core_spi

#endif
