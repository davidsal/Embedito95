// CORE
#include <core_serial.h>
#include <core_gpio.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>
// LIBRARIES
#include <lib_dht22.h>

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
core_object::Object<lib_dht22::Dht22Sensor> sensor = lib_dht22::getSensor(core_gpio::Pin::PIN_2);

void testTruthiness() {
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	if ((!temperature.isNull && temperature.value != 0)) {
		serial.sendLine(1);
	}
	if (!((!temperature.isNull && temperature.value != 0))) {
		serial.sendLine(0);
	}
	serial.sendLine((!temperature.isNull && temperature.value != 0) ? 1 : 0);
}

void testNullish() {
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	const f32 fallback = (temperature.isNull ? 0.0f : temperature.value);
	if (fallback > 10.0) {
		serial.sendLine(1);
	}
	const f32 chained = (temperature.isNull ? 0.0f : temperature.value);
	if (chained > 10.0) {
		serial.sendLine(1);
	}
	const f32 direct = ({ auto _e95_t0 = lib_dht22::getTemperature(sensor); (_e95_t0.isNull ? 0.0f : _e95_t0.value); });
	if (direct > 10.0) {
		serial.sendLine(1);
	}
}

void testOr() {
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	const f32 fallback = ((!temperature.isNull && temperature.value != 0) ? temperature.value : 1.0f);
	if (fallback > 10.0) {
		serial.sendLine(1);
	}
	const i8 zero = 0;
	const i8 value = (zero != 0 ? zero : 5);
	serial.sendLine(value);
}

void testAnd() {
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	const nullable<f32> both = ((!temperature.isNull && temperature.value != 0) ? nullable<f32>{ false, 1.0 } : temperature);
	if (both.value > 10.0) {
		serial.sendLine(1);
	}
}

void testCompound() {
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	const nullable<f32> humidity = lib_dht22::getHumidity(sensor);
	if (((!temperature.isNull && temperature.value != 0) && (!humidity.isNull && humidity.value != 0))) {
		serial.sendLine(1);
	}
	if (((!temperature.isNull && temperature.value != 0) || (!humidity.isNull && humidity.value != 0))) {
		serial.sendLine(1);
	}
	serial.sendLine(((!temperature.isNull && temperature.value != 0) && (!humidity.isNull && humidity.value != 0)) ? 1 : 0);
	serial.sendLine(((!temperature.isNull && temperature.value != 0) || (!humidity.isNull && humidity.value != 0)) ? 1 : 0);
}

void testNarrowing() {
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	if ((!temperature.isNull && temperature.value > 10.0)) {
		serial.sendLine(1);
	}
	if ((temperature.isNull || temperature.value > 10.0)) {
		serial.sendLine(1);
	}
}

void testNarrowedValue() {
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	if (!temperature.isNull) {
		const f32 narrowedValue = temperature.value;
		if (narrowedValue > 10.0) {
			serial.sendLine(1);
		}
		const f32 narrowedOr = (temperature.value != 0 ? temperature.value : 1.0f);
		if (narrowedOr > 10.0) {
			serial.sendLine(1);
		}
	}
}

void testCharacters() {
	core_string::String label = F("hello");
	if (label.length() != 0) {
		serial.sendLine(1);
	}
	const char letter = 'a';
	if (true) {
		serial.sendLine(1);
	}
}

void testMoreTypes() {
	const nullable<boolean> flag = nullable<boolean>{ true, false };
	if ((!flag.isNull && flag.value)) {
		serial.sendLine(1);
	}
	const boolean flagOr = ((!flag.isNull && flag.value) ? flag.value : false);
	if (flagOr) {
		serial.sendLine(1);
	}
	const boolean flagNullish = (flag.isNull ? true : flag.value);
	if (flagNullish) {
		serial.sendLine(1);
	}

	const nullable<core_string::String> name = nullable<core_string::String>{ true, core_string::String::null() };
	if ((!name.isNull && name.value.length() != 0)) {
		serial.sendLine(1);
	}
	core_string::String nameOr = ((!name.isNull && name.value.length() != 0) ? name.value : F("none"));
	serial.send(nameOr);
	core_string::String nameNullish = (name.isNull ? F("hi") : name.value);
	serial.send(nameNullish);

	const nullable<char> letter = nullable<char>{ true, 0 };
	if (!letter.isNull) {
		serial.sendLine(1);
	}

	const nullable<core_gpio::Pin> pin = nullable<core_gpio::Pin>{ true, static_cast<core_gpio::Pin>(0) };
	if ((!pin.isNull && pin.value != 0)) {
		serial.sendLine(1);
	}
	const nullable<core_serial::Serial> port = nullable<core_serial::Serial>{ true, static_cast<core_serial::Serial>(0) };
	if ((!port.isNull && port.value != 0)) {
		serial.sendLine(1);
	}
	const nullable<core_array::Array<u8>> buffer = nullable<core_array::Array<u8>>{ true, 0 };
	if (!buffer.isNull) {
		serial.sendLine(1);
	}
}

void testNullableAssignments() {
	nullable<boolean> flag = nullable<boolean>{ true, false };
	flag = nullable<boolean>{ false, true };
	const nullable<i16> count = nullable<i16>{ false, 3 };
	nullable<f32> reading = nullable<f32>{ true, 0.0f };
	reading = nullable<f32>{ false, 1.5f };
	const nullable<core_string::String> label = nullable<core_string::String>{ false, F("hi") };
	const nullable<char> letter = nullable<char>{ false, 'a' };
	serial.sendLine((count.isNull ? 0 : count.value));
	if ((!flag.isNull && flag.value)) {
		serial.sendLine(1);
	}
	if ((!reading.isNull && reading.value != 0)) {
		serial.sendLine(1);
	}
	serial.send((label.isNull ? F("none") : label.value));
	serial.sendLine((letter.isNull ? '?' : letter.value));
}

void testDirectNullCheck() {
	if (!lib_dht22::getTemperature(sensor).isNull) {
		serial.sendLine(1);
	}
	if (lib_dht22::getHumidity(sensor).isNull) {
		serial.sendLine(0);
	}
}

void testNullableCasts() {
	const f32 direct = (f32)(lib_dht22::getTemperature(sensor).value);
	if (direct > 10.0) {
		serial.sendLine(1);
	}
	const nullable<f32> humidity = lib_dht22::getHumidity(sensor);
	const f32 fromVariable = (f32)(humidity.value);
	if (fromVariable > 10.0) {
		serial.sendLine(1);
	}
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	testTruthiness();
	testNullish();
	testOr();
	testAnd();
	testCompound();
	testNarrowing();
	testNarrowedValue();
	testCharacters();
	testMoreTypes();
	testNullableAssignments();
	testDirectNullCheck();
	testNullableCasts();
}

void loop() {
}
