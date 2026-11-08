// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
core_array::Array<core_array::Array<u8>> FRAMES = { core_array::Array<u8>(0, 36, 36, 0), core_array::Array<u8>(0, 0, 102, 0), core_array::Array<u8>(0, 72, 72, 0) };

void drawRow(core_array::Array<u8> row) {
	for (u8 index = 0; (u16)(index) < row.length(); index += 1) {
		serial.sendLine(row[index]);
	}
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	serial.sendLine(FRAMES.length());

	for (u8 frame = 0; (u16)(frame) < FRAMES.length(); frame += 1) {
		core_array::Array<u8> row = FRAMES[frame];
		serial.sendLine(row.length());
		drawRow(row);
	}

	serial.sendLine(FRAMES[1][2]);
}
