// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

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
	self->count = self->count + (i16)(1);
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

i16 bumpCounter(core_object::Object<Counter> c) {
	increment(c);
	c = makeCounter();
	increment(c);
	return getValue(c);
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<SensorConfig> sensorConfig = core_object::Object<SensorConfig>(SensorConfig{ 3, F("dht22"), nullable<boolean>{ false, true } });
	core_object::Object<SensorConfig> minimalConfig = core_object::Object<SensorConfig>(SensorConfig{ 4, F("tmp36"), nullable<boolean>{ true, false } });
	core_object::Object<makePointReturn> point = makePoint(5, 10);
	core_object::Object<Counter> counter = makeCounter();
	increment(counter);
	increment(counter);
	const i16 viaClosure = bumpCounter(counter);
	serial.sendLine(sensorConfig->pin);
	serial.sendLine(minimalConfig->pin);
	serial.sendLine(point->x);
	serial.sendLine(getValue(counter));
	serial.sendLine(viaClosure);
}

void loop() {
}
