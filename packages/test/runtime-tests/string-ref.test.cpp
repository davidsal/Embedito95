// Host unit tests for the candidate copy-on-write String backed by the
// core_mem::Ref motor (strategies/shared/string/string_ref.h).
//
// Validates the TS-like immutable-observable semantics (share on copy, detach
// on first write, never affects the caller) and no-leak/UAF behaviour on the
// host (clang++) before string_ref.h supersedes string_common.h/.cpp
// (todayPlan.md "Decisión: string como handle copy-on-write (CoW)").

#define _E95_STRING_REF_TRACK
#include "packages/registry/src/strategies/shared/string/string_ref.h"

#include <stdio.h>
#include <string.h>

using core_string::String;

int core_string::Storage::live = 0;

static int failures = 0;

#define CHECK(cond)                                                              \
	do {                                                                          \
		if (!(cond)) {                                                              \
			failures++;                                                               \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);                   \
		}                                                                           \
	} while (0)

static int strEq(const String &s, const char *expected) {
	return s == expected && strcmp(s.c_str(), expected) == 0;
}

// --- free-function helpers modelling the TS pass-by-value string boundary -----
//
// A function that receives a String by value receives a copy of the HANDLE
// (refs+1) sharing the block. Writing (`+=`) inside the callee detaches its own
// copy, so the caller's string is never modified (immutable-observable, unlike
// Array which is shared-mutable).
static void takesStringAddsSuffix(String s) {
	s += "_suffix"; // detaches s's share; caller untouched
}

static void takesStringAppendsChar(String s) {
	s.push('!'); // detach + mutate local share only
}

static void takesStringRebinds(String s) {
	s = "local"; // local binding only; caller untouched
}

static String buildIncrementally() {
	String s;
	for (char c = 'a'; c <= 'e'; c++) {
		s.push(c);
	}
	s += "_tail";
	return s; // transferred by move, no double-acquire
}

static void scenarioCopySharesThenFirstWriteDetaches() {
	core_string::Storage::live = 0;
	{
		String a = "hello";
		String b = a;
		// Copy shares the same block (no text copy): identical raw buffers.
		CHECK(a.raw() == b.raw());
		CHECK(b.length() == 5);
		CHECK(strEq(a, "hello"));
		CHECK(strEq(b, "hello"));
		// First write to b detaches: b now owns an independent copy.
		b += "_x";
		CHECK(a.raw() != b.raw());
		CHECK(strEq(a, "hello"));
		CHECK(strEq(b, "hello_x"));
		// Writing to a after the split still leaves b alone.
		a += "_y";
		CHECK(strEq(a, "hello_y"));
		CHECK(strEq(b, "hello_x"));
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioCharMutationThroughOperatorIndexDetaches() {
	core_string::Storage::live = 0;
	{
		String a = "abc";
		String b = a; // share
		CHECK(a.raw() == b.raw());
		b[0] = 'X'; // operator[] detaches before handing out the char ref
		CHECK(a.raw() != b.raw());
		CHECK(strEq(a, "abc"));
		CHECK(strEq(b, "Xbc"));
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioReadThroughConstDoesNotDetach() {
	core_string::Storage::live = 0;
	{
		String a = "hello";
		String b = a; // share
		const String &cref = b;
		char c = cref[1]; // const read: no detach, still shared
		CHECK(c == 'e');
		CHECK(a.raw() == b.raw());
		CHECK(core_string::Storage::live == 1);
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioParamWriteNeverReachesCaller() {
	core_string::Storage::live = 0;
	{
		String a = "abc";
		takesStringAddsSuffix(a);
		CHECK(strEq(a, "abc"));
		takesStringAppendsChar(a);
		CHECK(strEq(a, "abc"));
		takesStringRebinds(a);
		CHECK(strEq(a, "abc"));
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioRebindingBindingIsLocal() {
	String s = "one";
	String other = "two";
	String t = s; // share
	CHECK(s.raw() == t.raw());
	t = other; // t aliases other's block now; s untouched
	CHECK(s.raw() != t.raw());
	CHECK(strEq(s, "one"));
	CHECK(strEq(t, "two"));
	t += "?";
	CHECK(strEq(other, "two")); // shared with t before detach? other was not written
	CHECK(strEq(t, "two?"));
}

static void scenarioReturnTransfersOwnership() {
	core_string::Storage::live = 0;
	{
		String r = buildIncrementally();
		CHECK(strEq(r, "abcde_tail"));
		r += "_z";
		CHECK(strEq(r, "abcde_tail_z"));
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioOperatorPlusIsIndependent() {
	core_string::Storage::live = 0;
	{
		String a = "ab";
		String c = a + "cd"; // result shares a, then detaches and appends
		CHECK(strEq(a, "ab"));
		CHECK(strEq(c, "abcd"));
		CHECK(a.raw() != c.raw());
		a += "XY";
		CHECK(strEq(c, "abcd")); // unaffected
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioSelfAppendDoubles() {
	String s = "ab";
	s += s;
	CHECK(strEq(s, "abab"));
	String t = "x";
	t.push('y');
	t.push('z');
	CHECK(strEq(t, "xyz"));
}

static void scenarioScopeExitOneOfTwoHandlesKeepsAlive() {
	core_string::Storage::live = 0;
	{
		String outer;
		{
			String inner = outer; // share the (empty) block
			CHECK(core_string::Storage::live == 1);
			inner += "data"; // detach inner, outer still empty
			CHECK(core_string::Storage::live == 2);
			CHECK(strEq(inner, "data"));
			CHECK(outer.length() == 0);
		} // inner dtor frees its detached block
		CHECK(core_string::Storage::live == 1);
		CHECK(outer.length() == 0);
	} // outer dtor: last ref frees the empty block
	CHECK(core_string::Storage::live == 0);
}

static void scenarioTwoHandlesOneLeavesScopeOtherSurvives() {
	core_string::Storage::live = 0;
	{
		String keeper = "keep";
		{
			String tmp = keeper; // share
			CHECK(core_string::Storage::live == 1);
			CHECK(keeper.raw() == tmp.raw());
		} // tmp leaves scope: refs 2 -> 1, keeper's block still valid (no UAF)
		CHECK(core_string::Storage::live == 1);
		CHECK(strEq(keeper, "keep"));
		CHECK(keeper.raw() != nullptr);
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioNoLeakAcrossChurn() {
	core_string::Storage::live = 0;
	for (int round = 0; round < 200; round++) {
		String s;
		for (int i = 0; i < 40; i++) {
			s.push((char)('a' + (i % 26)));
		}
		String copy = s; // share
		for (int i = 0; i < 15; i++) {
			copy.pop(); // detaches copy; writes to copy only
		}
		String other = "x";
		other = s; // rebind: release other's block, alias s
		other += "_end"; // detach other, append
	}
	CHECK(core_string::Storage::live == 0);
}

// Same literal into two independent Strings: because construction copies into a
// refs=1 RAM block, the two never share, so writing to one cannot corrupt the
// other. (Models the AVR flash-literal invariant without needing real flash.)
static void scenarioSameLiteralTwoStringsIndependent() {
	core_string::Storage::live = 0;
	{
		String a = "shared_literal";
		String b = "shared_literal";
		CHECK(a.raw() != b.raw());
		CHECK(strEq(a, "shared_literal"));
		CHECK(strEq(b, "shared_literal"));
		a += "A";
		CHECK(strEq(a, "shared_literalA"));
		CHECK(strEq(b, "shared_literal")); // other untouched
	}
	CHECK(core_string::Storage::live == 0);
}

static void scenarioPushPopAndReuseGrow() {
	String s;
	// A fresh string reserves its initial capacity up front and is empty.
	CHECK(s.length() == 0);
	CHECK(s.raw() != nullptr);
	CHECK(strEq(s, ""));
	for (int i = 0; i < 100; i++) {
		s.push('z');
	}
	CHECK(s.length() == 100);
	for (int i = 0; i < 100; i++) {
		s.pop();
	}
	CHECK(s.length() == 0);
	CHECK(strEq(s, ""));
	s += "after";
	CHECK(strEq(s, "after"));
}

int main() {
	scenarioCopySharesThenFirstWriteDetaches();
	scenarioCharMutationThroughOperatorIndexDetaches();
	scenarioReadThroughConstDoesNotDetach();
	scenarioParamWriteNeverReachesCaller();
	scenarioRebindingBindingIsLocal();
	scenarioReturnTransfersOwnership();
	scenarioOperatorPlusIsIndependent();
	scenarioSelfAppendDoubles();
	scenarioScopeExitOneOfTwoHandlesKeepsAlive();
	scenarioTwoHandlesOneLeavesScopeOtherSurvives();
	scenarioNoLeakAcrossChurn();
	scenarioSameLiteralTwoStringsIndependent();
	scenarioPushPopAndReuseGrow();

	if (failures == 0) {
		printf("String-CoW: all scenarios passed\n");
		return 0;
	}
	printf("String-CoW: %d check(s) failed\n", failures);
	return 1;
}
