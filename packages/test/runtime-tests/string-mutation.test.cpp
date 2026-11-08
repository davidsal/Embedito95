// Host unit tests for the String mutators declared in
// strategies/shared/string/string_common.h and defined in string_common.cpp.
//
// The real shared files are compiled directly (not a mirror), so the semantics
// validated here are the ones the generated platform headers inline. Every
// mutator writes through the copy-on-write handle, so each one must detach a
// shared box before writing and leave the other holders untouched.

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

static void scenarioSetCharacterWritesInRangeOnly() {
	String text = "abc";
	text.setCharacter(1, 'X');
	CHECK(textEquals(text, "aXc"));
	text.setCharacter(2, 'Z');
	CHECK(textEquals(text, "aXZ"));
	// Out of range is a no-op, not a crash or a terminator write.
	text.setCharacter(3, '?');
	CHECK(textEquals(text, "aXZ"));
	text.setCharacter(100, '?');
	CHECK(textEquals(text, "aXZ"));
	String empty;
	empty.setCharacter(0, 'a');
	CHECK(textEquals(empty, ""));
	String nullText = String::null();
	nullText.setCharacter(0, 'a');
	CHECK(textEquals(nullText, ""));
}

static void scenarioAppendTextMatchesOperatorPlusEquals() {
	String text = "hi";
	text.appendText(" there");
	CHECK(textEquals(text, "hi there"));
	text.appendText("");
	CHECK(textEquals(text, "hi there"));
	String suffix = "!";
	text.appendText(suffix);
	CHECK(textEquals(text, "hi there!"));
	// Self-append doubles the text, exactly like `+=`.
	String doubled = "ab";
	doubled.appendText(doubled);
	CHECK(textEquals(doubled, "abab"));
	String empty;
	empty.appendText("value");
	CHECK(textEquals(empty, "value"));
}

static void scenarioReplaceTextReplacesEveryOccurrence() {
	String text = "banana";
	CHECK(text.replaceText("na", "NA"));
	CHECK(textEquals(text, "baNANA"));
	// No occurrence: nothing changes and the call reports false.
	String stable = "banana";
	CHECK(!stable.replaceText("xy", "z"));
	CHECK(textEquals(stable, "banana"));
	// Empty search is rejected.
	CHECK(!stable.replaceText("", "z"));
	CHECK(textEquals(stable, "banana"));
	// Empty replacement deletes every occurrence.
	String removed = "a-b-c";
	CHECK(removed.replaceText("-", ""));
	CHECK(textEquals(removed, "abc"));
	// Replacing in place with a shorter text.
	String shortened = "aaaa";
	CHECK(shortened.replaceText("aa", "b"));
	CHECK(textEquals(shortened, "bb"));
	CHECK(!shortened.replaceText("aaaa", "x"));
	CHECK(textEquals(shortened, "bb"));}

static void scenarioReplaceTextHandlesOverlapAndGrowth() {
	// Overlapping source matches advance by the search length, so "aaa" with
	// "aa" -> "b" yields "ba" (non-overlapping replacement).
	String overlapping = "aaa";
	CHECK(overlapping.replaceText("aa", "b"));
	CHECK(textEquals(overlapping, "ba"));
	// Replacing with a much longer text grows the buffer.
	String grown = "a.a.a.a";
	CHECK(grown.replaceText(".", "----"));
	CHECK(textEquals(grown, "a----a----a----a"));
	// Replacing with a much shorter text shrinks logically while keeping later
	// characters intact.
	String shrunk = "abcabcabc";
	CHECK(shrunk.replaceText("abc", "x"));
	CHECK(textEquals(shrunk, "xxx"));
}

static void scenarioReplaceTextIsSafeAgainstAliasing() {
	String text = "hello";
	String needle = text; // shares the same box as text
	CHECK(text.replaceText(needle, "hi"));
	CHECK(textEquals(text, "hi"));
	// The alias still holds the original text: replace built a fresh box.
	CHECK(textEquals(needle, "hello"));

	String self = "x.x";
	CHECK(self.replaceText(self.getSlice(0, 1), "y"));
	CHECK(textEquals(self, "y.y"));
}

static void scenarioRemoveRangeTrimsHalfOpenSpans() {
	String text = "abcdef";
	text.removeRange(1, 3);
	CHECK(textEquals(text, "adef"));
	text.removeRange(0, 4);
	CHECK(textEquals(text, ""));
	text.removeRange(0, 1);
	CHECK(textEquals(text, ""));
	// Inverted and out-of-range spans are no-ops.
	String stable = "abc";
	stable.removeRange(2, 1);
	CHECK(textEquals(stable, "abc"));
	stable.removeRange(3, 5);
	CHECK(textEquals(stable, "abc"));
	stable.removeRange(0, 100);
	CHECK(textEquals(stable, ""));
	String nullText = String::null();
	nullText.removeRange(0, 1);
	CHECK(textEquals(nullText, ""));
}

static void scenarioTrimWhitespaceRemovesBothEndsOnly() {
	String text = " \t\n\rHello\tworld\r\n ";
	text.trimWhitespace();
	CHECK(textEquals(text, "Hello\tworld"));
	String noWhitespace = "plain";
	noWhitespace.trimWhitespace();
	CHECK(textEquals(noWhitespace, "plain"));
	String allWhitespace = " \t\r\n ";
	allWhitespace.trimWhitespace();
	CHECK(textEquals(allWhitespace, ""));
	String nullText = String::null();
	nullText.trimWhitespace();
	CHECK(textEquals(nullText, ""));
}

static void scenarioCaseFoldingIsAsciiOnly() {
	String upper = "Hello-95!\xC3\xA9";
	upper.toUpperCase();
	CHECK(textEquals(upper, "HELLO-95!\xC3\xA9"));
	String lower = "Hello-95!\xC3\x89";
	lower.toLowerCase();
	CHECK(textEquals(lower, "hello-95!\xC3\x89"));
	String symbols = "123-+_!";
	symbols.toUpperCase();
	CHECK(textEquals(symbols, "123-+_!"));
	symbols.toLowerCase();
	CHECK(textEquals(symbols, "123-+_!"));
}

static void scenarioMutatorsDetachSharedHandles() {
	String original = "hello";
	String alias = original;
	CHECK(original.c_str() == alias.c_str());

	alias.setCharacter(0, 'J');
	CHECK(original.c_str() != alias.c_str());
	CHECK(textEquals(original, "hello"));
	CHECK(textEquals(alias, "Jello"));

	alias.appendText("!");
	CHECK(textEquals(original, "hello"));
	CHECK(textEquals(alias, "Jello!"));

	alias.replaceText("l", "L");
	CHECK(textEquals(original, "hello"));
	CHECK(textEquals(alias, "JeLLo!"));

	alias.removeRange(0, 1);
	CHECK(textEquals(original, "hello"));
	CHECK(textEquals(alias, "eLLo!"));

	alias.trimWhitespace();
	CHECK(textEquals(original, "hello"));
	CHECK(textEquals(alias, "eLLo!"));

	alias.toUpperCase();
	CHECK(textEquals(original, "hello"));
	CHECK(textEquals(alias, "ELLO!"));

	alias.toLowerCase();
	CHECK(textEquals(original, "hello"));
	CHECK(textEquals(alias, "ello!"));
}

static void scenarioReadOnlyAccessorsStillShare() {
	String original = "shared";
	String copy = original;
	CHECK(original.c_str() == copy.c_str());
	(void)copy.getCharacter(0);
	(void)copy.getSlice(0, 2);
	(void)copy.findTextFrom("ar", 0);
	(void)copy.hasPrefix("sh");
	(void)copy.matchesText("shared");
	// No mutation happened: the handles still point at the same box.
	CHECK(original.c_str() == copy.c_str());
}

int main() {
	scenarioSetCharacterWritesInRangeOnly();
	scenarioAppendTextMatchesOperatorPlusEquals();
	scenarioReplaceTextReplacesEveryOccurrence();
	scenarioReplaceTextHandlesOverlapAndGrowth();
	scenarioReplaceTextIsSafeAgainstAliasing();
	scenarioRemoveRangeTrimsHalfOpenSpans();
	scenarioTrimWhitespaceRemovesBothEndsOnly();
	scenarioCaseFoldingIsAsciiOnly();
	scenarioMutatorsDetachSharedHandles();
	scenarioReadOnlyAccessorsStillShare();

	if (failures == 0) {
		printf("String-Mutation: all scenarios passed\n");
		return 0;
	}
	printf("String-Mutation: %d check(s) failed\n", failures);
	return 1;
}
