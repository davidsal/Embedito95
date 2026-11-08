// Host unit tests for the read-only String accessor/search methods declared in
// strategies/shared/string/string_common.h and defined in string_common.cpp.
//
// The real shared files are compiled directly (not a mirror) so the semantics
// validated here are the ones the generated platform headers inline. The
// methods are const and must not detach a shared copy-on-write handle.
//
// STM32 limitation: only the shared sources are compiled here. The generated
// STM32 translation unit (src/stm32-bluepill/snapshots/engine/type/
// core_string.cpp) is validated by snapshot comparison, not by test:runtime;
// wiring it into stm32-syntax-check.js would not execute its semantics either.
// Running the same assertions against that generated file needs a dedicated
// harness (TICKET-52), so the host test of the shared sources remains the
// behavioural coverage for STM32.

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

static bool textEquals(const String &text, const char *expected) {
	return strcmp(text.c_str(), expected) == 0;
}

static void scenarioGetCharacterReadsAndBounds() {
	String text = "hello";
	CHECK(text.getCharacter(0) == 'h');
	CHECK(text.getCharacter(4) == 'o');
	CHECK(text.getCharacter(5) == '\0');
	CHECK(text.getCharacter(100) == '\0');
	String empty;
	CHECK(empty.getCharacter(0) == '\0');
	String nullText = String::null();
	CHECK(nullText.getCharacter(0) == '\0');
}

static void scenarioGetSliceClampsAndRejectsInvertedRanges() {
	String text = "abcdef";
	CHECK(textEquals(text.getSlice(1, 4), "bcd"));
	CHECK(textEquals(text.getSlice(0, 0), ""));
	CHECK(textEquals(text.getSlice(4, 1), ""));
	CHECK(textEquals(text.getSlice(2, 100), "cdef"));
	CHECK(textEquals(text.getSlice(100, 200), ""));
	CHECK(textEquals(text.getSlice(0, 6), "abcdef"));
	String empty;
	CHECK(textEquals(empty.getSlice(0, 10), ""));
	CHECK(textEquals(empty.getSlice(2, 1), ""));
}

static void scenarioFindTextFromAndBounds() {
	String text = "banana";
	CHECK(text.findTextFrom("na", 0) == 2);
	CHECK(text.findTextFrom("na", 3) == 4);
	CHECK(text.findTextFrom("na", 5) == -1);
	CHECK(text.findTextFrom("xyz", 0) == -1);
	CHECK(text.findTextFrom("", 0) == 0);
	CHECK(text.findTextFrom("", 6) == 6);
	CHECK(text.findTextFrom("", 7) == -1);
	CHECK(text.findTextFrom("banana", 0) == 0);
	CHECK(text.findTextFrom("banana", 1) == -1);
	String empty;
	CHECK(empty.findTextFrom("", 0) == 0);
	CHECK(empty.findTextFrom("", 1) == -1);
	CHECK(empty.findTextFrom("a", 0) == -1);
}

static void scenarioFindLastTextFromAndBounds() {
	String text = "banana";
	CHECK(text.findLastTextFrom("na", 6) == 4);
	CHECK(text.findLastTextFrom("na", 4) == 4);
	CHECK(text.findLastTextFrom("na", 3) == 2);
	CHECK(text.findLastTextFrom("ba", 0) == 0);
	CHECK(text.findLastTextFrom("ba", 1) == 0);
	CHECK(text.findLastTextFrom("xyz", 6) == -1);
	CHECK(text.findLastTextFrom("", 6) == 6);
	CHECK(text.findLastTextFrom("", 0) == 0);
	CHECK(text.findLastTextFrom("", 7) == -1);
	CHECK(text.findLastTextFrom("banana", 6) == 0);
	String empty;
	CHECK(empty.findLastTextFrom("", 0) == 0);
	CHECK(empty.findLastTextFrom("", 1) == -1);
	CHECK(empty.findLastTextFrom("a", 0) == -1);
}

static void scenarioHasPrefixAndSuffix() {
	String text = "embedded";
	CHECK(text.hasPrefix("embed"));
	CHECK(text.hasPrefix(""));
	CHECK(text.hasPrefix("embedded"));
	CHECK(!text.hasPrefix("embedded!"));
	CHECK(!text.hasPrefix("Embed"));
	CHECK(text.hasSuffix("ded"));
	CHECK(text.hasSuffix(""));
	CHECK(text.hasSuffix("embedded"));
	CHECK(!text.hasSuffix("embed"));
	CHECK(!text.hasSuffix("DED"));
	String empty;
	CHECK(empty.hasPrefix(""));
	CHECK(empty.hasSuffix(""));
	CHECK(!empty.hasPrefix("a"));
	CHECK(!empty.hasSuffix("a"));
}

static void scenarioMatchesText() {
	String text = "value";
	CHECK(text.matchesText("value"));
	CHECK(!text.matchesText("Value"));
	CHECK(!text.matchesText("value!"));
	CHECK(!text.matchesText(""));
	String empty;
	CHECK(empty.matchesText(""));
	CHECK(!empty.matchesText("value"));
}

static void scenarioMatchesTextIgnoringCaseIsAsciiOnly() {
	String text = "Value-95";
	CHECK(text.matchesTextIgnoringCase("value-95"));
	CHECK(text.matchesTextIgnoringCase("VALUE-95"));
	CHECK(!text.matchesTextIgnoringCase("value-96"));
	CHECK(!text.matchesTextIgnoringCase("value"));
	CHECK(!text.matchesTextIgnoringCase(""));
	String empty;
	CHECK(empty.matchesTextIgnoringCase(""));
	// Non-ASCII bytes are not folded: 0xC3 0x89 is not 0xC3 0xA9.
	String upper = "\xC3\x89";
	String lower = "\xC3\xA9";
	CHECK(!upper.matchesTextIgnoringCase(lower));
}

static void scenarioReadMethodsNeverDetachSharedStorage() {
	String original = "shared";
	String copy = original;
	CHECK(original.c_str() == copy.c_str());

	(void)copy.getCharacter(0);
	(void)copy.getSlice(0, 2);
	(void)copy.findTextFrom("ar", 0);
	(void)copy.findLastTextFrom("ar", 5);
	(void)copy.hasPrefix("sh");
	(void)copy.hasSuffix("ed");
	(void)copy.matchesText("shared");
	(void)copy.matchesTextIgnoringCase("SHARED");

	CHECK(original.c_str() == copy.c_str());

	copy.push('!');
	CHECK(original.c_str() != copy.c_str());
	CHECK(textEquals(original, "shared"));
	CHECK(textEquals(copy, "shared!"));
}

int main() {
	scenarioGetCharacterReadsAndBounds();
	scenarioGetSliceClampsAndRejectsInvertedRanges();
	scenarioFindTextFromAndBounds();
	scenarioFindLastTextFromAndBounds();
	scenarioHasPrefixAndSuffix();
	scenarioMatchesText();
	scenarioMatchesTextIgnoringCaseIsAsciiOnly();
	scenarioReadMethodsNeverDetachSharedStorage();

	if (failures == 0) {
		printf("String-Methods: all scenarios passed\n");
		return 0;
	}
	printf("String-Methods: %d check(s) failed\n", failures);
	return 1;
}
