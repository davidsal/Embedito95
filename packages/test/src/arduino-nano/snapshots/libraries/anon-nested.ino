// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct makeRectReturn1 {
	i8 x;
	i8 y;
};

struct makeRectReturn {
	core_object::Object<makeRectReturn1> origin;
	i8 w;
	i8 h;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

core_object::Object<makeRectReturn> makeRect() {
	core_object::Object<makeRectReturn1> origin = core_object::Object<makeRectReturn1>(makeRectReturn1{ 0, 0 });
	return core_object::Object<makeRectReturn>(makeRectReturn{ origin, 10, 20 });
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<makeRectReturn> rect = makeRect();
	core_object::Object<makeRectReturn> copy = rect;
	rect->origin->x = 99;
	rect->origin->y = 88;

	serial.sendLine(rect->origin->x);
	serial.sendLine(rect->origin->y);
	serial.sendLine(copy->origin->x);
	serial.sendLine(rect->w);
	serial.sendLine(rect->h);
	core_object::Object<makeRectReturn> other = makeRect();
	other->origin->x = 1;
	serial.sendLine(other->origin->x);
	serial.sendLine(rect->origin->x);
}

void loop() {
}
