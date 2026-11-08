// CORE
#include "core/serial/core_serial.h"
#include "core/i2c/core_i2c.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

void startPort(core_serial::SerialPort p) {
	p.initialize(9600);
	return;
}

void rebindPort(core_serial::SerialPort p) {
	core_serial::SerialPort other = core_serial::getSerial(core_serial::Serial::SERIAL_1);
	other.initialize(115200);
	p = other;
	return;
}

void useBus(core_i2c::I2CBus b) {
	b.initialize();
	return;
}

int main() {
	// SETUP
	initializeSystemClock();

	// MAIN
	core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
	core_serial::SerialPort serialAlias = serial;
	startPort(serial);
	startPort(serialAlias);
	rebindPort(serial);

	core_i2c::I2CBus bus = core_i2c::getI2C(core_i2c::I2C::I2C_1);
	core_i2c::I2CBus busAlias = bus;
	useBus(bus);
	useBus(busAlias);
}
