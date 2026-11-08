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
	core_string::String text = F("  Hello  ");
	text.trimWhitespace();
	serial.sendLine(text);

	core_string::String alias = text;
	alias.toUpperCase();
	serial.sendLine(text);
	serial.sendLine(alias);

	alias.setCharacter(0, 'J');
	serial.sendLine(alias);

	alias.appendText(F("!"));
	serial.sendLine(alias);

	const boolean replaced = alias.replaceText(F("LL"), F("ll"));
	serial.sendLine(replaced ? 1 : 0);
	serial.sendLine(alias);

	alias.removeRange(0, 1);
	serial.sendLine(alias);

	alias.toLowerCase();
	serial.sendLine(alias);
}

void loop() {
}
