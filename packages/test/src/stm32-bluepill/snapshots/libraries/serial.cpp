// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
core_serial::SerialPort secondary = core_serial::getSerial(core_serial::Serial::SERIAL_2);
const u8 SMALL_UNSIGNED = 200;
const i8 SMALL_SIGNED = -100;
const u16 MEDIUM_UNSIGNED = 40000;
const i16 MEDIUM_SIGNED = -30000;
const u32 WIDE_UNSIGNED = 4000000000;
const i32 WIDE_SIGNED = -2000000000;
const u64 HUGE_UNSIGNED = 5000000000;
const i64 HUGE_SIGNED = -5000000000;
const f32 REAL = 1.5f;
const f64 DOUBLE_REAL = 2.25;
const char LETTER = 'A';

void testSend() {
	serial.send("Counter: ");
	serial.send(65);
	secondary.send(255);
	serial.sendLine(0);
	secondary.sendLine(255);
}

void testRead() {
	const nullable<u8> data = serial.read();
	if (!data.isNull) {
		serial.send(data.value);
	}
}

void testHasData() {
	if (serial.hasData()) {
		const nullable<u8> data = serial.read();
		if (!data.isNull) {
			serial.send(data.value);
		}
	}
}

void testNumericSend() {
	serial.send(SMALL_UNSIGNED);
	serial.send(SMALL_SIGNED);
	serial.send(MEDIUM_UNSIGNED);
	serial.send(MEDIUM_SIGNED);
	serial.send(WIDE_UNSIGNED);
	serial.send(WIDE_SIGNED);
	serial.send(HUGE_UNSIGNED);
	serial.send(HUGE_SIGNED);
	serial.send(REAL);
	serial.send(DOUBLE_REAL);
	serial.send(LETTER);
	secondary.send(HUGE_UNSIGNED);
	secondary.send(HUGE_SIGNED);
	serial.sendLine(SMALL_UNSIGNED);
	serial.sendLine(SMALL_SIGNED);
	serial.sendLine(MEDIUM_UNSIGNED);
	serial.sendLine(MEDIUM_SIGNED);
	serial.sendLine(WIDE_UNSIGNED);
	serial.sendLine(WIDE_SIGNED);
	serial.sendLine(HUGE_UNSIGNED);
	serial.sendLine(HUGE_SIGNED);
	serial.sendLine(REAL);
	serial.sendLine(DOUBLE_REAL);
	serial.sendLine(LETTER);
}

void testReadText() {
	core_string::String line = serial.readLine();
	serial.send(line);
	const i32 parsed = serial.readInteger();
	serial.sendLine(parsed);
}

void testReadTextUntil() {
	core_string::String untilSemicolon = serial.readTextUntil(';');
	serial.send(untilSemicolon);
	core_string::String untilPipe = serial.readTextUntil('|');
	serial.sendLine(untilPipe);
}

void testLifecycle() {
	serial.flushOutput();
	serial.close();
}

void testStreamReads() {
	const nullable<u8> next = serial.peekByte();
	if (!next.isNull) {
		serial.send(next.value);
	}
	const u16 writeSpace = serial.getWriteSpace();
	serial.send(writeSpace);
	const core_array::Array<u8> block = serial.readBlock(4);
	serial.sendBuffer(block);
	const core_array::Array<u8> until = serial.readBlockUntil(10, 8);
	serial.sendBuffer(until);
}

void testTextSearch() {
	core_string::String text = serial.readText();
	serial.send(text);
	const boolean found = serial.findText("needle");
	serial.send(found ? 1 : 0);
	const boolean foundUntil = serial.findTextUntil("stop", ';');
	serial.send(foundUntil ? 1 : 0);
	const f32 real = serial.readFloat();
	serial.send(real);
	serial.setReadTimeout(0);
	const u32 timeout = serial.getReadTimeout();
	serial.send(timeout);
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);
	secondary.initialize(115200);

	// MAIN
	testSend();
	testRead();
	testHasData();
	testNumericSend();
	testReadText();
	testReadTextUntil();
	testLifecycle();
	testStreamReads();
	testTextSearch();
}
