// CORE
#include "core/gpio/core_gpio.h"
#include "core/software_serial_hardware/core_software_serial_hardware.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/time/core_time.h"
// LIBRARIES
#include "libraries/software_serial/lib_software_serial.h"

const u32 BAUD_RATE = 115200;
const core_gpio::Pin TRANSMIT_PIN = core_gpio::Pin::PIN_A2;
const core_gpio::Pin RECEIVE_PIN = core_gpio::Pin::PIN_A3;
const core_gpio::Pin SECOND_RECEIVE_PIN = core_gpio::Pin::PIN_A4;
core_object::Object<lib_software_serial::SoftwareSerialPort> LINK = lib_software_serial::getSoftwareSerial(TRANSMIT_PIN, RECEIVE_PIN);
core_object::Object<lib_software_serial::SoftwareSerialPort> SECOND_LINK = lib_software_serial::getSoftwareSerial(TRANSMIT_PIN, SECOND_RECEIVE_PIN);

int main() {
	// SETUP
	initializeSystemClock();
	lib_software_serial::initialize(LINK, BAUD_RATE);

	// MAIN
	lib_software_serial::send(LINK, "status");
	lib_software_serial::sendLine(LINK, "ready");
	lib_software_serial::flushOutput(LINK);

	if (lib_software_serial::hasData(LINK)) {
		if (lib_software_serial::isListening(LINK)) {
			const nullable<u8> next = lib_software_serial::getNextByte(LINK);
			const nullable<u8> incoming = lib_software_serial::read(LINK);
			if (!incoming.isNull) {
				lib_software_serial::send(LINK, "byte");
			}
		}
	}

	core_string::String line = lib_software_serial::readLine(LINK);
	const i32 number = lib_software_serial::readInteger(LINK);
	const u8 capacity = lib_software_serial::getSoftwareSerialReceiveCapacity();
	const boolean overflowed = lib_software_serial::hasOverflowed(LINK);

	lib_software_serial::initialize(SECOND_LINK, BAUD_RATE);
	lib_software_serial::startListening(SECOND_LINK);
	const boolean secondListening = lib_software_serial::isListening(SECOND_LINK);
	const boolean firstListening = lib_software_serial::isListening(LINK);
	lib_software_serial::stopListening(SECOND_LINK);

	lib_software_serial::stopListening(LINK);
	lib_software_serial::close(LINK);
}
