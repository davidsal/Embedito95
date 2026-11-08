// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct Handler {
	void (*onEvent)(i16);
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void first(i16 value) {
	serial.sendLine(((i32)(value) + (i32)(1)));
}

void second(i16 value) {
	serial.sendLine(((i32)(value) + (i32)(2)));
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<Handler> handler = core_object::Object<Handler>(Handler{ first });
	handler->onEvent(10);
	handler->onEvent = second;
	handler->onEvent(10);
	core_object::Object<Handler> alias = handler;
	handler->onEvent = first;
	alias->onEvent(20);
}
