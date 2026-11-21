// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_string::String nombre = "ana";
	const i32 contador = 42;
	const f32 ratio = 1.5f;
	const boolean flag = true;
	core_string::String texto = (core_string::String(nombre) << "-" << core_string::String(contador) << "-" << core_string::String(ratio) << "-" << core_string::String(flag));
	serial.sendLine(texto);
}
