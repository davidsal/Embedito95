#ifndef _E95_CODEGEN_RUN_HOST_WIRE_H
#define _E95_CODEGEN_RUN_HOST_WIRE_H
// Host stand-in for the AVR `Wire.h` used by the codegen-run project. The
// generated `core_i2c.h` drives the transaction surface, so this header mirrors
// the TwoWire entry points it calls; it does not emulate a bus, because the
// codegen-run scenarios assert the generated call sequence, not the wire
// protocol (runtime-tests compile the same header against a fake bus).
#include <stddef.h>
#include <stdint.h>

class TwoWire {
public:
	typedef void (*ReceiveHandler)(int);
	typedef void (*RequestHandler)();

	void begin() {}
	void begin(uint8_t address) { (void)address; }
	void end() {}
	void setClock(uint32_t frequency) { (void)frequency; }
	void onReceive(ReceiveHandler handler) { (void)handler; }
	void onRequest(RequestHandler handler) { (void)handler; }
	void beginTransmission(uint8_t address) { (void)address; }
	size_t write(uint8_t value) {
		(void)value;
		return 1;
	}
	uint8_t endTransmission() { return 0; }
	uint8_t requestFrom(uint8_t address, uint8_t quantity) {
		(void)address;
		(void)quantity;
		return 0;
	}
	int read() { return -1; }
	int available() { return 0; }
};

inline TwoWire Wire;

#endif
