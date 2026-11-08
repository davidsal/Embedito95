// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct Response {
	i16 type;
	i16 from;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

i16 parseResponse(i16 type, core_object::Object<Response> data) {
	return data->type + data->from;
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Response> data = core_object::Object<Response>(Response{ 7, 3 });
	serial.sendLine(parseResponse(1, data));
}

void loop() {
}
