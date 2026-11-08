// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct Point {
	i16 x;
	i16 y;
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);
_E95_FLASH_STRING(greeting, "hi");
core_string::String text = core_string::String("");
core_array::Array<i16> fixed = { 10, 20, 30 };
core_array::Array<i8> small = { 1, 2, 3 };
core_array::Array<char> chars;
core_array::Array<i16> buffer;
core_array::Array<core_string::String> words;
core_array::Array<core_object::Object<Point>> points;

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	buffer.push(7);
	buffer.push(8);
	buffer.pop();
	chars.push('a');
	chars.push('b');
	words.push("a");
	words.push("b");
	text = "hello";
	text.push('!');

	const i32 total = (i32)(fixed[0]) + (i32)(buffer[0]);
	core_object::Object<Point> point = core_object::Object<Point>(Point{ 0, 0 });
	point->x = 5;
	point->y = total;
	points.push(point);
	serial.sendLine(points[0]->y);
	serial.sendLine(greeting);
	serial.sendLine(small.length());
	serial.sendLine(chars.length());
	serial.sendLine(words[0]);
	serial.sendLine(text);
}
