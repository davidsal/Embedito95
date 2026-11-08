// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct Point {
	i16 x;
	i16 y;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
core_object::Object<Point> origin = core_object::Object<Point>(Point{ 0, 0 });

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Point> p = origin;
	serial.sendLine(origin->x);
	serial.sendLine(p->y);
}

void loop() {
}
