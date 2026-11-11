// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void noReturn() {

}

i16 returnI16() {
	return 8;
}

void invokeVoid(void (*callback)()) {
	callback();
}

i16 invokeI16(i16 (*callback)()) {
	return callback();
}

void invokeWithArgument(void (*callback)(i16)) {
	callback(1);
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	invokeVoid(noReturn);
	invokeVoid([]() -> void {

	});
	const i16 value = invokeI16(returnI16);
	serial.sendLine(value);
	invokeWithArgument([](i16 value) -> void {
		serial.sendLine(value);
	});
}
