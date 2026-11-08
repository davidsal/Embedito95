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

void shift(core_object::Object<Point> p, i16 dx) {
	p->x = p->x + dx;
}

void reset(core_object::Object<Point> p) {
	p = core_object::Object<Point>(Point{ 100, 200 });
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Point> a = core_object::Object<Point>(Point{ 1, 2 });
	core_object::Object<Point> b = a;
	b->x = 9;
	serial.sendLine(a->x);
	serial.sendLine(a->y);

	shift(a, 5);
	serial.sendLine(a->x);
	serial.sendLine(b->x);

	reset(a);
	serial.sendLine(a->x);
	serial.sendLine(a->y);

	core_object::Object<Point> c = core_object::Object<Point>(Point{ 1, 2 });
	c->x = 7;
	serial.sendLine(a->x);
	serial.sendLine(c->x);
}

void loop() {
}
