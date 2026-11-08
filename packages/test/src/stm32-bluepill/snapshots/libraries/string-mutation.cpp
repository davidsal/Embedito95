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
	core_string::String text = "  Hello  ";
	text.trimWhitespace();
	serial.sendLine(text);

	core_string::String alias = text;
	alias.toUpperCase();
	serial.sendLine(text);
	serial.sendLine(alias);

	alias.setCharacter(0, 'J');
	serial.sendLine(alias);

	alias.appendText("!");
	serial.sendLine(alias);

	const boolean replaced = alias.replaceText("LL", "ll");
	serial.sendLine(replaced ? 1 : 0);
	serial.sendLine(alias);

	alias.removeRange(0, 1);
	serial.sendLine(alias);

	alias.toLowerCase();
	serial.sendLine(alias);
}
