// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct Handler {
	void (*onEvent)(i16);
};

struct Adder {
	i16 (*add)(i16, i16);
};

struct Outer {
	core_object::Object<Handler> handler;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void printValue(i16 value) {
	serial.sendLine(value);
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Handler> inlineHandler = core_object::Object<Handler>(Handler{ [](i16 value) -> void {
		serial.sendLine((value + (i16)(1)));
	} });
	inlineHandler->onEvent(10);
	core_object::Object<Handler> delegating = core_object::Object<Handler>(Handler{ [](i16 value) -> void {
		printValue((value + (i16)(2)));
	} });
	delegating->onEvent(20);
	inlineHandler->onEvent = printValue;
	inlineHandler->onEvent(30);
	core_object::Object<Adder> adder = core_object::Object<Adder>(Adder{ [](i16 a, i16 b) -> i16 {
		return a + b;
	} });
	serial.sendLine(adder->add(2, 3));
	core_object::Object<Outer> outer = core_object::Object<Outer>(Outer{ core_object::Object<Handler>(Handler{ [](i16 value) -> void {
		printValue((value + (i16)(4)));
	} }) });
	outer->handler->onEvent(40);
}

void loop() {
}
