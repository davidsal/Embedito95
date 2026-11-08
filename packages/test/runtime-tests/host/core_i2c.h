#ifndef _E95_RUNTIME_HOST_CORE_I2C_H
#define _E95_RUNTIME_HOST_CORE_I2C_H
// Host stand-in for the generated `core_i2c.h`. It exposes the slice of the
// surface a generated library uses (`getI2C`, `initialize` and `write`) and
// records every write in the shared ordered event log, so runtime tests can
// assert the control byte, the chunk lengths and the write sequence.
#include <Arduino.h>
#include <bus_event_log.h>
#include <core_array.h>

namespace core_i2c {

typedef enum : u8 {
	I2C_1 = 1,
	I2C_2 = 2
} I2C;

struct Recording {
	u16 writeCallCount;
	u16 initializeCallCount;

	Recording()
		: writeCallCount(0)
		, initializeCallCount(0) {}
};

inline Recording recording;

inline void resetRecording() {
	recording = Recording();
	bus_event_log::reset();
}

struct I2CBus {
	void initialize() {
		recording.initializeCallCount++;
	}

	void write(u8 address, const core_array::Array<u8> &payload) {
		recording.writeCallCount++;
		bus_event_log::recordBusWrite(address, payload);
	}
};

inline I2CBus getI2C(I2C channel) {
	(void)channel;
	return I2CBus();
}

} // namespace core_i2c

#endif
