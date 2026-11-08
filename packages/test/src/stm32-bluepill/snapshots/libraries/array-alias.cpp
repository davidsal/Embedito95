// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void addValue(core_array::Array<i16> arr, i16 v) {
	arr.push(v);
}

void resetArr(core_array::Array<i16> arr) {
	core_array::Array<i16> fresh = { 100, 200 };
	arr = fresh;
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_array::Array<i16> a = { 1, 2, 3 };
	core_array::Array<i16> b = a;
	b.push(9);
	serial.sendLine(a.length());
	serial.sendLine(b.length());
	addValue(a, 7);
	serial.sendLine(a.length());
	serial.sendLine(b.length());
	resetArr(a);
	serial.sendLine(a.length());
	core_array::Array<i16> c = { 5, 6 };
	c.push(1);
	serial.sendLine(c.length());
	serial.sendLine(a.length());
}
