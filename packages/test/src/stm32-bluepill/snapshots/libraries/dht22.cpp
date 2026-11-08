// CORE
#include "core/serial/core_serial.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
// LIBRARIES
#include "libraries/dht22/lib_dht22.h"

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
core_object::Object<lib_dht22::Dht22Sensor> sensor = lib_dht22::getSensor(core_gpio::Pin::PIN_A0);

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	const nullable<f32> temperature = lib_dht22::getTemperature(sensor);
	const nullable<f32> humidity = lib_dht22::getHumidity(sensor);
	if (temperature.value > 0.0) {
		serial.sendLine(1);
	} else {
		serial.sendLine(0);
	}
	if (humidity.value > 0.0) {
		serial.sendLine(1);
	} else {
		serial.sendLine(0);
	}
}
