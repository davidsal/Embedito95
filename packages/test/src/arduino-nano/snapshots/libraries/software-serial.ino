// CORE
#include <core_gpio.h>
#include <core_software_serial_hardware.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>
// LIBRARIES
#include <lib_software_serial.h>

const u32 BAUD_RATE = 9600;
const u32 FAST_BAUD_RATE = 57600;
const core_gpio::Pin TRANSMIT_PIN = core_gpio::Pin::PIN_3;
const core_gpio::Pin RECEIVE_PIN = core_gpio::Pin::PIN_2;
const core_gpio::Pin SECOND_RECEIVE_PIN = core_gpio::Pin::PIN_8;
core_object::Object<lib_software_serial::SoftwareSerialPort> LINK = lib_software_serial::getSoftwareSerial(TRANSMIT_PIN, RECEIVE_PIN);
core_object::Object<lib_software_serial::SoftwareSerialPort> SECOND_LINK = lib_software_serial::getSoftwareSerial(TRANSMIT_PIN, SECOND_RECEIVE_PIN);

void setup() {
	// SETUP
	lib_software_serial::initialize(LINK, BAUD_RATE);
	lib_software_serial::sendLine(LINK, F("ready"));

	// MAIN
	lib_software_serial::send(LINK, F("status"));
	lib_software_serial::initialize(LINK, FAST_BAUD_RATE);
	lib_software_serial::flushOutput(LINK);

	if (lib_software_serial::hasData(LINK)) {
		if (lib_software_serial::isListening(LINK)) {
			const nullable<u8> next = lib_software_serial::getNextByte(LINK);
			const nullable<u8> incoming = lib_software_serial::read(LINK);
			if (!incoming.isNull) {
				lib_software_serial::send(LINK, F("byte"));
			}
		}
	}

	core_string::String line = lib_software_serial::readLine(LINK);
	const i32 number = lib_software_serial::readInteger(LINK);
	const u8 capacity = lib_software_serial::getSoftwareSerialReceiveCapacity();
	const boolean overflowed = lib_software_serial::hasOverflowed(LINK);

	lib_software_serial::initialize(SECOND_LINK, FAST_BAUD_RATE);
	lib_software_serial::startListening(SECOND_LINK);
	const boolean secondListening = lib_software_serial::isListening(SECOND_LINK);
	const boolean firstListening = lib_software_serial::isListening(LINK);
	lib_software_serial::stopListening(SECOND_LINK);

	lib_software_serial::stopListening(LINK);
	lib_software_serial::close(LINK);
}

void loop() {
}
