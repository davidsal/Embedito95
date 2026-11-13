#include "core_console.h"
#include "core_string.h"

#include <stdio.h>

namespace core_console {

namespace {

const char *const NULL_TEXT = "null";
const char *const EMPTY_TEXT = "";
const char LINE_TERMINATOR = '\n';
const char TEXT_TERMINATOR = '\0';
const u16 CHARACTER_TEXT_SIZE = 2;

void writeLine(const char *text) {
	const char *const content = text ? text : EMPTY_TEXT;
	fputs(content, stdout);
	fputc(LINE_TERMINATOR, stdout);
}

} // namespace

void log(const char *data) {
	writeLine(data);
}

void log(const core_string::String &data) {
	writeLine(data.c_str());
}

void log(char value) {
	const char text[CHARACTER_TEXT_SIZE] = { value, TEXT_TERMINATOR };
	writeLine(text);
}

void log(u8 value) {
	writeLine(core_string::String(value).c_str());
}

void log(i8 value) {
	writeLine(core_string::String(value).c_str());
}

void log(u16 value) {
	writeLine(core_string::String(value).c_str());
}

void log(i16 value) {
	writeLine(core_string::String(value).c_str());
}

void log(u32 value) {
	writeLine(core_string::String(value).c_str());
}

void log(i32 value) {
	writeLine(core_string::String(value).c_str());
}

void log(u64 value) {
	writeLine(core_string::String(value).c_str());
}

void log(i64 value) {
	writeLine(core_string::String(value).c_str());
}

void log(f32 value) {
	writeLine(core_string::String(value).c_str());
}

void log(f64 value) {
	writeLine(core_string::String(value).c_str());
}

void log(boolean value) {
	writeLine(core_string::String(value).c_str());
}

void log(nullable<core_string::String> value) {
	writeLine(value.isNull ? NULL_TEXT : value.value.c_str());
}

} // namespace core_console
