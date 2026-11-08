// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct Point {
	i16 x;
	i16 y;
};

struct Handler {
	void (*onEvent)(i16);
};

struct Accumulator {
	i16 value;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

i16 sum(core_object::Object<Point> &self);
i16 quadruple(core_object::Object<Accumulator> &self);
i16 twice(core_object::Object<Accumulator> &self);

void printValue(i16 value) {
	serial.sendLine(value);
}

i16 sum(core_object::Object<Point> &self) {

	return (i32)(self->x) + (i32)(self->y);
}

i16 quadruple(core_object::Object<Accumulator> &self) {
	return twice(self) * 2;
}

i16 twice(core_object::Object<Accumulator> &self) {
	return (i32)(self->value) * (i32)(2);
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<Point> p = core_object::Object<Point>(Point{ 3, 4 });
	serial.sendLine(sum(p));
	p->x = 10;
	serial.sendLine(sum(p));
	core_object::Object<Point> alias = p;
	alias->y = 20;
	serial.sendLine(sum(p));
	serial.sendLine(sum(alias));
	core_object::Object<Handler> handler = core_object::Object<Handler>(Handler{ printValue });
	handler->onEvent(7);
	core_object::Object<Accumulator> acc = core_object::Object<Accumulator>(Accumulator{ 3 });
	serial.sendLine(quadruple(acc));
}
