// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct Response {
	i16 type;
	i16 from;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

i16 parseResponse(i16 type, core_object::Object<Response> data) {
	return (i32)(data->type) + (i32)(data->from);
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<Response> data = core_object::Object<Response>(Response{ 7, 3 });
	serial.sendLine(parseResponse(1, data));
}
