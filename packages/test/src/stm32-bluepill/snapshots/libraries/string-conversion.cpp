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
	core_string::String signedText = "  -42abc";
	serial.sendLine(signedText.parseInteger());

	core_string::String empty = "";
	serial.sendLine(empty.parseInteger());

	core_string::String overflow = " 2147483648";
	serial.sendLine(overflow.parseInteger());

	core_string::String exponent = " 2.5e-3";
	serial.sendLine(exponent.parseFloat64());

	core_string::String single = " 1.5";
	serial.sendLine(single.parseFloat32());

	core_string::String text = "AB";
	const core_array::Array<u8> bytes = text.toByteArray();
	serial.sendLine(bytes.length());
	serial.sendLine(bytes[0]);

	const core_array::Array<char> characters = text.toCharacterArray();
	const core_array::Array<char> emptyCharacters = empty.toCharacterArray();
	serial.sendLine(characters.length());
	serial.sendLine(characters[2] == emptyCharacters[0] ? 1 : 0);

	text.reserveCapacity(2);
	serial.sendLine(text.length());
}
