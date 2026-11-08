// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void decorate(core_string::String s) {
	s.push('!');
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_string::String greeting = F("hi");
	core_string::String copy = greeting;
	copy.push('!');
	serial.sendLine(greeting.length());
	serial.sendLine(copy.length());
	decorate(greeting);
	serial.sendLine(greeting.length());
	core_string::String other = F("x");
	serial.sendLine(other);
	serial.sendLine(greeting);
}

void loop() {
}
