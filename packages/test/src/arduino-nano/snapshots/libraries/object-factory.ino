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

core_object::Object<Point> makePoint(i16 x, i16 y) {
	return core_object::Object<Point>(Point{ x, y });
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Point> p1 = makePoint(7, 8);
	core_object::Object<Point> p2 = makePoint(9, 10);
	p1->x = 1;
	serial.sendLine(p1->x);
	serial.sendLine(p2->x);

	core_object::Object<Point> b = p1;
	b->x = 42;
	serial.sendLine(p1->x);
	serial.sendLine(p2->x);
}

void loop() {
}
