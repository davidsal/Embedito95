// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct Inner {
	i16 x;
	i16 y;
};

struct Outer {
	core_string::String label;
	core_object::Object<Inner> inner;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void shift(core_object::Object<Outer> o, i16 dx) {
	o->inner->x = o->inner->x + dx;
}

void swap(core_object::Object<Outer> o) {
	core_object::Object<Outer> fresh = core_object::Object<Outer>(Outer{ F("swap"), core_object::Object<Inner>(Inner{ 100, 200 }) });
	o = fresh;
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Outer> o = core_object::Object<Outer>(Outer{ F("hello"), core_object::Object<Inner>(Inner{ 1, 2 }) });
	serial.sendLine(o->inner->x);
	serial.sendLine(o->inner->y);
	core_object::Object<Outer> p = o;
	p->inner->x = 9;
	serial.sendLine(o->inner->x);
	serial.sendLine(p->inner->x);
	shift(o, 5);
	serial.sendLine(o->inner->x);
	serial.sendLine(p->inner->x);
	swap(o);
	serial.sendLine(o->label);
	serial.sendLine(o->inner->x);
	core_object::Object<Outer> q = core_object::Object<Outer>(Outer{ F("world"), core_object::Object<Inner>(Inner{ 40, 50 }) });
	serial.sendLine(q->inner->x);
	serial.sendLine(q->inner->y);
	serial.sendLine(q->label);
	serial.sendLine(o->inner->x);
}

void loop() {
}
