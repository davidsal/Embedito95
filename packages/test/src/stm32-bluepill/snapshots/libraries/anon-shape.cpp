// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct makePointReturn {
	i16 x;
	i16 y;
};

struct mainReturn {
	i8 x;
	i8 y;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

core_object::Object<makePointReturn> makePoint(i16 x, i16 y) {
	return core_object::Object<makePointReturn>(makePointReturn{ x, y });
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<mainReturn> a = core_object::Object<mainReturn>(mainReturn{ 1, 2 });
	core_object::Object<mainReturn> b = a;
	b->x = 9;
	serial.sendLine(a->x);
	serial.sendLine(a->y);
	serial.sendLine(b->x);
	b = core_object::Object<mainReturn>(mainReturn{ 100, 110 });
	serial.sendLine(a->x);
	serial.sendLine(b->x);
	core_object::Object<makePointReturn> p = makePoint(3, 4);
	core_object::Object<makePointReturn> q = p;
	q->y = 40;
	serial.sendLine(p->x);
	serial.sendLine(p->y);
	serial.sendLine(q->x);
}
