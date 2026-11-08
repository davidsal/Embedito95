// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct SensorConfig {
	i16 pin;
	core_string::String label;
	nullable<boolean> isValid;
};

struct Counter {
	i16 count;
};

struct makePointReturn {
	i16 x;
	i16 y;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void increment(core_object::Object<Counter> &self);
i16 getValue(core_object::Object<Counter> &self);

void increment(core_object::Object<Counter> &self) {
	self->count = (i16)((i32)(self->count) + (i32)(1));
}

i16 getValue(core_object::Object<Counter> &self) {
	return self->count;
}

core_object::Object<Counter> makeCounter() {
	return core_object::Object<Counter>(Counter{ 0 });
}

core_object::Object<makePointReturn> makePoint(i16 x, i16 y) {
	return core_object::Object<makePointReturn>(makePointReturn{ x, y });
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<SensorConfig> sensorConfig = core_object::Object<SensorConfig>(SensorConfig{ 3, "dht22", nullable<boolean>{ false, true } });
	core_object::Object<SensorConfig> minimalConfig = core_object::Object<SensorConfig>(SensorConfig{ 4, "tmp36", nullable<boolean>{ true, false } });
	core_object::Object<makePointReturn> point = makePoint(5, 10);
	core_object::Object<Counter> counter = makeCounter();
	increment(counter);
	increment(counter);
	serial.sendLine(sensorConfig->pin);
	serial.sendLine(minimalConfig->pin);
	serial.sendLine(point->x);
	serial.sendLine(getValue(counter));
}
