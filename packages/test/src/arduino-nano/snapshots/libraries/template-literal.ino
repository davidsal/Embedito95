// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_string::String nombre = F("ana");
	const i32 contador = 42;
	const f32 ratio = 1.5f;
	const boolean flag = true;
	core_string::String texto = (core_string::String(nombre) << F("-") << core_string::String(contador) << F("-") << core_string::String(ratio) << F("-") << core_string::String(flag));
	serial.sendLine(texto);
}

void loop() {
}
