// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void decorate(core_string::String s) {
	s.push('!');
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_string::String greeting = "hi";
	core_string::String copy = greeting;
	copy.push('!');
	serial.sendLine(greeting.length());
	serial.sendLine(copy.length());
	decorate(greeting);
	serial.sendLine(greeting.length());
	core_string::String other = "x";
	serial.sendLine(other);
	serial.sendLine(greeting);
}
