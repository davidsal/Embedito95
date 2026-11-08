// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
const u8 SMALL_UNSIGNED = 200;
const i8 SMALL_SIGNED = -100;
const u16 MEDIUM_UNSIGNED = 40000;
const i16 MEDIUM_SIGNED = -30000;
const u32 WIDE_UNSIGNED = 4000000000;
const i32 WIDE_SIGNED = -2000000000;
const u64 HUGE_UNSIGNED = 5000000000;
const i64 HUGE_SIGNED = -5000000000;
const f32 REAL = 1.5f;
const char LETTER = 'A';

void testSend() {
	serial.send(F("Counter: "));
	serial.send(65);
	serial.sendLine(0);
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
	serial.send(LETTER);
	serial.sendLine(SMALL_UNSIGNED);
	serial.sendLine(SMALL_SIGNED);
	serial.sendLine(MEDIUM_UNSIGNED);
	serial.sendLine(MEDIUM_SIGNED);
	serial.sendLine(WIDE_UNSIGNED);
	serial.sendLine(WIDE_SIGNED);
	serial.sendLine(HUGE_UNSIGNED);
	serial.sendLine(HUGE_SIGNED);
	serial.sendLine(REAL);
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
	const boolean found = serial.findText(F("needle"));
	serial.send(found ? 1 : 0);
	const boolean foundUntil = serial.findTextUntil(F("stop"), ';');
	serial.send(foundUntil ? 1 : 0);
	const f32 real = serial.readFloat();
	serial.send(real);
	serial.setReadTimeout(0);
	const u32 timeout = serial.getReadTimeout();
	serial.send(timeout);
}

void setup() {
	// SETUP
	serial.initialize(9600);

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

void loop() {
}
