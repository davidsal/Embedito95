// CORE
#include "core/i2c/core_i2c.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"

const u8 DEVICE_ADDRESS = 60;
const u8 REGISTER_ADDRESS = 0;
const u32 CLOCK_HERTZ = 100000;
const u8 READ_QUANTITY = 2;
const u8 SLAVE_ADDRESS = 66;
const u8 SLAVE_RESPONSE_HIGH = 1;
const u8 SLAVE_RESPONSE_LOW = 2;
core_i2c::I2CBus bus = core_i2c::getI2C(core_i2c::I2C::I2C_1);

core_i2c::I2CStatus writeRegister(u8 value) {
	bus.beginWrite(DEVICE_ADDRESS);
	bus.sendByte(REGISTER_ADDRESS);
	bus.sendByte(value);
	return bus.endWrite();
}

core_i2c::I2CStatus inspectTransaction(u8 value) {
	const core_i2c::I2CStatus status = writeRegister(value);
	if (status != core_i2c::I2CStatus::OK) {
		if (status == core_i2c::I2CStatus::ADDRESS_NACK) {
			return status;
		}
		bus.beginWrite(DEVICE_ADDRESS);
		bus.sendByte(value);
		return bus.endWrite();
	}
	return status;
}

void readRegister() {
	bus.write(DEVICE_ADDRESS, { REGISTER_ADDRESS });
	bus.requestFrom(DEVICE_ADDRESS, READ_QUANTITY);
	const u8 highByte = bus.read();
	bus.write(DEVICE_ADDRESS, { highByte });
	const u8 lowByte = bus.read();
	bus.write(DEVICE_ADDRESS, { lowByte });
}

void onSlaveReceive() {
	const u8 pending = bus.available();
	if ((i16)(pending) > (i16)(0)) {
		bus.read();
	}
}

void onSlaveRequest() {
	bus.sendResponse({ SLAVE_RESPONSE_HIGH, SLAVE_RESPONSE_LOW });
}

void configureSlave() {
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	bus.onRequest(onSlaveRequest);
}

int main() {
	// SETUP
	initializeSystemClock();
	bus.initialize();
	bus.setClock(CLOCK_HERTZ);

	// MAIN
	const core_i2c::I2CStatus status = inspectTransaction(REGISTER_ADDRESS);
	if (status == core_i2c::I2CStatus::OK) {
		readRegister();
	}
	bus.close();
	configureSlave();
}
