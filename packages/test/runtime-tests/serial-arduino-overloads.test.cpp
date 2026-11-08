// Host compile guard for the real arduino serial header
// (strategies/arduino/serial/serial.h). It is included verbatim against the
// AVR-like `Print` stand-in (no 64-bit overloads), so any regression that hands
// a u64/i64 (or a float) straight to `print`/`println` becomes an ambiguous-call
// error here — exactly the failure QA reproduced for arduino-nano/uno.
//
// The `SerialPort::send`/`sendLine` overloads are inline in the header, so the
// body of `exerciseSerialOverloads` forces overload resolution for every width
// without linking core_serial.cpp.

#include <stdint.h>
#include <stdio.h>

// The generated header substitutes the support block (getSerial + Serial enum)
// with this marker; emptying it lets the raw template compile on the host.
#define _e95_replace_serialSupport
#include "packages/registry/src/strategies/arduino/serial/serial.h"

void exerciseSerialOverloads(const core_serial::SerialPort &port) {
	port.send("text");
	port.send(F("flash"));
	port.send('c');
	port.send((u8)200);
	port.send((i8)-100);
	port.send((u16)40000);
	port.send((i16)-30000);
	port.send((u32)4000000000UL);
	port.send((i32)-2000000000L);
	port.send((u64)5000000000ULL);
	port.send((i64)-5000000000LL);
	port.send((f32)1.5f);
	port.send((f64)2.25);

	port.sendLine("text");
	port.sendLine(F("flash"));
	port.sendLine('c');
	port.sendLine((u8)200);
	port.sendLine((i8)-100);
	port.sendLine((u16)40000);
	port.sendLine((i16)-30000);
	port.sendLine((u32)4000000000UL);
	port.sendLine((i32)-2000000000L);
	port.sendLine((u64)5000000000ULL);
	port.sendLine((i64)-5000000000LL);
	port.sendLine((f32)1.5f);
	port.sendLine((f64)2.25);
}

int main() {
	printf("Serial arduino overloads: compiles against AVR-like Print\n");
	return 0;
}
