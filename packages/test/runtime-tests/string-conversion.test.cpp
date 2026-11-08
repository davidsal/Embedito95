// Host unit tests for the String numeric conversion and buffer-copy surface
// declared in strategies/shared/string/string_common.h and defined in
// string_common.cpp. The real shared files are compiled directly, so the
// tables below validate the same parsers the generated headers inline.
//
// The parsers are hand-written and locale-independent: they only understand
// ASCII digits, a leading sign, a decimal point and a decimal exponent. The
// expected values are therefore identical on every platform.

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef uint8_t u8;
typedef int8_t i8;
typedef uint16_t u16;
typedef int16_t i16;
typedef uint32_t u32;
typedef int32_t i32;
typedef uint64_t u64;
typedef int64_t i64;
typedef unsigned __int128 u128;
typedef __int128 i128;
typedef bool boolean;
typedef float f32;
typedef double f64;

template<typename T> struct nullable {
	boolean isNull;
	T value;
};

#define _E95_FLASH_STRING_TYPE const char *
#define _E95_READ_FLASH_BYTE(pointer) (*(pointer))
#define _e95_replace_stringGrowthDivisor 4
#define _e95_replace_arrayGrowthDivisor 4
#define _e95_replace_numberFormat

#include "packages/registry/src/strategies/shared/memory/ref.h"

namespace core_array {
#include "packages/registry/src/strategies/shared/array/array.common.h"
} // namespace core_array

namespace core_string {
#include "packages/registry/src/strategies/shared/string/string_common.h"
#include "packages/registry/src/strategies/shared/string/string_common.cpp"
#include "packages/registry/src/strategies/shared/string/number_format.inc"
} // namespace core_string

using core_string::String;

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                          \
		if (!(condition)) {                                                        \
			failures++;                                                             \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                          \
	} while (0)

struct IntegerCase {
	const char *text;
	i32 expected;
};

static const IntegerCase INTEGER_CASES[] = {
	{"", 0},
	{"abc", 0},
	{"-", 0},
	{"+", 0},
	{"   ", 0},
	{"0", 0},
	{"42", 42},
	{"+42", 42},
	{"-42", -42},
	{"  42", 42},
	{"\t\n\r 42", 42},
	{"42abc", 42},
	{"  -7xyz", -7},
	{"12.9", 12},
	{"2147483647", 2147483647},
	{"-2147483648", -2147483647 - 1},
	{"2147483648", 2147483647},
	{"-2147483649", -2147483647 - 1},
	{"99999999999999999999", 2147483647},
	{"-99999999999999999999", -2147483647 - 1},
};

struct FloatCase {
	const char *text;
	f64 expected;
};

static const FloatCase FLOAT_CASES[] = {
	{"", 0.0},
	{"abc", 0.0},
	{"-", 0.0},
	{"+", 0.0},
	{"0", 0.0},
	{"1.5", 1.5},
	{"-1.5", -1.5},
	{"+1.5", 1.5},
	{" 3.25", 3.25},
	{"\t3.25\n", 3.25},
	{"1.5e-3", 0.0015},
	{"2E3", 2000.0},
	{"-2.5e2", -250.0},
	{"1.5e", 1.5},
	{"1.5e+", 1.5},
	{".5", 0.5},
	{"-.5", -0.5},
	{"3.", 3.0},
	{"12.5abc", 12.5},
};

static bool floatsAreClose(f64 left, f64 right) {
	const f64 difference = left - right;
	const f64 absolute = difference < 0.0 ? -difference : difference;
	const f64 scale = right < 0.0 ? -right : right;
	return absolute <= scale * 1e-12 + 1e-12;
}

static bool float32ValuesAreClose(f32 left, f64 right) {
	const f64 difference = (f64)left - right;
	const f64 absolute = difference < 0.0 ? -difference : difference;
	const f64 scale = right < 0.0 ? -right : right;
	return absolute <= scale * 1e-6 + 1e-6;
}

static void scenarioParseIntegerTable() {
	const size_t caseCount = sizeof(INTEGER_CASES) / sizeof(INTEGER_CASES[0]);
	for (size_t index = 0; index < caseCount; index++) {
		String text = INTEGER_CASES[index].text;
		CHECK(text.parseInteger() == INTEGER_CASES[index].expected);
	}
}

static void scenarioParseIntegerOnNullOrEmpty() {
	String nullText = String::null();
	CHECK(nullText.parseInteger() == 0);
	String empty;
	CHECK(empty.parseInteger() == 0);
}

static void scenarioParseFloatTable() {
	const size_t caseCount = sizeof(FLOAT_CASES) / sizeof(FLOAT_CASES[0]);
	for (size_t index = 0; index < caseCount; index++) {
		String text = FLOAT_CASES[index].text;
		CHECK(floatsAreClose(text.parseFloat64(), FLOAT_CASES[index].expected));
		CHECK(float32ValuesAreClose(text.parseFloat32(), FLOAT_CASES[index].expected));
	}
}

static void scenarioParseFloatKeepsPrecision() {
	String text = "1.5e-3";
	CHECK(floatsAreClose(text.parseFloat64(), 0.0015));
	CHECK(float32ValuesAreClose(text.parseFloat32(), 0.0015));
	String whole = "-123456";
	CHECK(floatsAreClose(whole.parseFloat64(), -123456.0));
}

static void scenarioParseFloatOverflowAndUnderflowAreBounded() {
	String huge = "1e999";
	CHECK(huge.parseFloat64() > 1e300);
	String tiny = "1e-999";
	CHECK(tiny.parseFloat64() == 0.0);
}

static void scenarioParseFloatOnNullOrEmpty() {
	String nullText = String::null();
	CHECK(nullText.parseFloat64() == 0.0);
	CHECK(nullText.parseFloat32() == 0.0f);
	String empty;
	CHECK(empty.parseFloat64() == 0.0);
}

static void scenarioToByteArrayHasNoTerminator() {
	String text = "AB";
	core_array::Array<u8> bytes = text.toByteArray();
	CHECK(bytes.length() == 2);
	CHECK(bytes[0] == 'A');
	CHECK(bytes[1] == 'B');

	String empty;
	CHECK(empty.toByteArray().length() == 0);

	String nullText = String::null();
	CHECK(nullText.toByteArray().length() == 0);
}

static void scenarioToByteArrayMapsHighBytes() {
	String text = "\xFF\x80";
	core_array::Array<u8> bytes = text.toByteArray();
	CHECK(bytes.length() == 2);
	CHECK(bytes[0] == 0xFF);
	CHECK(bytes[1] == 0x80);
}

static void scenarioToCharacterArrayIncludesTerminator() {
	String text = "AB";
	core_array::Array<char> characters = text.toCharacterArray();
	CHECK(characters.length() == 3);
	CHECK(characters[0] == 'A');
	CHECK(characters[1] == 'B');
	CHECK(characters[2] == '\0');

	String empty;
	core_array::Array<char> emptyCharacters = empty.toCharacterArray();
	CHECK(emptyCharacters.length() == 1);
	CHECK(emptyCharacters[0] == '\0');

	String nullText = String::null();
	core_array::Array<char> nullCharacters = nullText.toCharacterArray();
	CHECK(nullCharacters.length() == 1);
	CHECK(nullCharacters[0] == '\0');
}

static void scenarioBufferCopiesDoNotDetachSharedHandles() {
	String original = "shared";
	String alias = original;
	core_array::Array<u8> bytes = alias.toByteArray();
	CHECK(bytes.length() == 6);
	CHECK(original.length() == 6);
	CHECK(alias.length() == 6);
	alias.setCharacter(0, 'S');
	CHECK(original.getCharacter(0) == 's');
	CHECK(alias.getCharacter(0) == 'S');
}

static void scenarioReserveCapacityNeverTruncates() {
	String text = "hello";
	text.reserveCapacity(2);
	CHECK(text.length() == 5);
	CHECK(strcmp(text.c_str(), "hello") == 0);

	text.reserveCapacity(1000);
	CHECK(text.length() == 5);
	CHECK(strcmp(text.c_str(), "hello") == 0);

	String empty;
	empty.reserveCapacity(64);
	CHECK(empty.length() == 0);

	String nullText = String::null();
	nullText.reserveCapacity(64);
	CHECK(nullText.length() == 0);
	nullText.push('a');
	CHECK(strcmp(nullText.c_str(), "a") == 0);
}

int main() {
	scenarioParseIntegerTable();
	scenarioParseIntegerOnNullOrEmpty();
	scenarioParseFloatTable();
	scenarioParseFloatKeepsPrecision();
	scenarioParseFloatOverflowAndUnderflowAreBounded();
	scenarioParseFloatOnNullOrEmpty();
	scenarioToByteArrayHasNoTerminator();
	scenarioToByteArrayMapsHighBytes();
	scenarioToCharacterArrayIncludesTerminator();
	scenarioBufferCopiesDoNotDetachSharedHandles();
	scenarioReserveCapacityNeverTruncates();

	if (failures > 0) {
		printf("%d check(s) failed\n", failures);
		return 1;
	}
	printf("string-conversion: all checks passed\n");
	return 0;
}
