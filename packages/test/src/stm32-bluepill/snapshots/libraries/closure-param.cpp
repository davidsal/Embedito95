// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct Counter {
	i16 count;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void increment(core_object::Object<Counter> &self);
i16 getValue(core_object::Object<Counter> &self);
void add(core_object::Object<Counter> &self, i16 amount);

void increment(core_object::Object<Counter> &self) {
	add(self, 1);
}

i16 getValue(core_object::Object<Counter> &self) {
	return self->count;
}

void add(core_object::Object<Counter> &self, i16 amount) {
	self->count = (i16)((i32)(self->count) + (i32)(amount));
}

core_object::Object<Counter> makeCounter() {
	return core_object::Object<Counter>(Counter{ 0 });
}

i16 bumpCounter(core_object::Object<Counter> c) {
	increment(c);
	c = makeCounter();
	increment(c);
	increment(c);
	return getValue(c);
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<Counter> counter = makeCounter();
	increment(counter);
	increment(counter);
	const i16 viaClosure = bumpCounter(counter);
	serial.sendLine(getValue(counter));
	serial.sendLine(viaClosure);
}
