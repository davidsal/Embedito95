// Host unit tests for the candidate shared-mutable Array<T> backed by the
// core_mem::Ref motor (strategies/shared/array/array_ref.h).
//
// Validates the TS-like alias/share semantics and no-leak/UAF behaviour on the
// host (clang++) before array_ref.h supersedes array.common.h and is wired into
// the codegen (todayPlan.md "gestión de memoria").

#include "packages/registry/src/strategies/shared/array/array_ref.h"

#include <stdio.h>
#include <utility>

using core_array::Array;

// Tracks live element instances so an undestroyed buffer (leak) surfaces as a
// nonzero count once a scenario's scope ends.
struct Tracked {
	static int live;

	explicit Tracked(int value) : value(value) {
		live++;
	}

	Tracked(const Tracked &other) : value(other.value) {
		live++;
	}

	~Tracked() {
		live--;
	}

	int value;
};

int Tracked::live = 0;

static int failures = 0;

#define CHECK(cond)                                                              \
	do {                                                                          \
		if (!(cond)) {                                                              \
			failures++;                                                               \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);                   \
		}                                                                           \
	} while (0)

// --- free-function helpers modelling the TS pass-by-handle boundary ---------
//
// A function that receives an Array<T> by value receives a copy of the handle
// (refcount +1) pointing at the SAME box. Mutating content (push / operator[])
// writes through to the shared box, so the caller sees it (alias, NOT CoW).
static void mutateContentThroughParam(Array<int> arr) {
	arr.push(42);
	arr[0] = 7;
}

static void rebindParam(Array<int> arr) {
	Array<int> fresh{9, 9};
	arr = fresh; // local handle now aliases `fresh`; caller's box untouched
	arr.push(1);
}

static void takeAndRebindTracked(Array<Tracked> arr) {
	Array<Tracked> fresh;
	fresh.push(Tracked(9));
	arr = fresh; // releases arr's share of the caller box (caller still holds it)
}

static Array<int> makeRange(int count) {
	Array<int> result;
	for (int i = 0; i < count; i++) {
		result.push(i);
	}
	return result; // transferred by move/NRVO, no double-acquire
}

static Array<Tracked> makeTrackedRange(int count) {
	Array<Tracked> result;
	for (int i = 0; i < count; i++) {
		result.push(Tracked(i));
	}
	return result;
}

static void scenarioEmptyArraysAreIndependent() {
	Array<int> a;
	Array<int> b;
	// A fresh array reserves its initial capacity up front (empty, not null).
	CHECK(a.length() == 0);
	CHECK(a.raw() != nullptr);
	a.push(5);
	b.push(7);
	CHECK(a.length() == 1);
	CHECK(b.length() == 1);
	CHECK(a[0] == 5);
	CHECK(b[0] == 7);
}

static void scenarioReserveGrowsButNeverShrinks() {
	Array<int> a;
	// A fresh array starts at the capacity floor.
	CHECK(a.capacity() == 5);
	CHECK(a.length() == 0);
	a.reserve(20);
	CHECK(a.capacity() >= 20);
	const uint16_t grown = a.capacity();
	a.reserve(1); // grow-only: a smaller request is a no-op
	CHECK(a.capacity() == grown);
	a.push(1); // reserving room does not create elements
	CHECK(a.length() == 1);
}

static void scenarioCopySharesAlias() {
	Array<int> a{1, 2, 3};
	Array<int> b = a;
	CHECK(a.raw() == b.raw());
	CHECK(b.length() == 3);
	// Mutating through one handle is visible through the other (alias).
	b.push(4);
	CHECK(a.length() == 4);
	CHECK(a[3] == 4);
	b[0] = 99;
	CHECK(a[0] == 99);
	a.push(5);
	CHECK(b.length() == 5);
	CHECK(b[4] == 5);
}

static void scenarioReassignIsLocal() {
	Array<int> a{1};
	Array<int> c{9};
	Array<int> b = a;
	CHECK(a.raw() == b.raw());
	b = c; // b now aliases c; a untouched
	CHECK(a.raw() != b.raw());
	CHECK(a.length() == 1);
	CHECK(a[0] == 1);
	b.push(2);
	CHECK(c.length() == 2); // b and c share storage
	CHECK(b[0] == 9);
	CHECK(b[1] == 2);
	CHECK(a.length() == 1);
}

static void scenarioPopReflectsOnAliasAndShrinks() {
	Array<int> a{1, 2, 3, 4, 5};
	Array<int> b = a;
	b.pop();
	CHECK(a.length() == 4);
	CHECK(b[3] == 4);
}

static void scenarioCopyAssignReleasesOld() {
	Tracked::live = 0;
	{
		Array<Tracked> a;
		a.push(Tracked(1));
		a.push(Tracked(2));
		Array<Tracked> b;
		b.push(Tracked(9));
		b = a; // b's old Storage (with the 9) must be freed
		CHECK(b.length() == 2);
		CHECK(a.raw() == b.raw());
	}
	CHECK(Tracked::live == 0);
}

static void scenarioMoveSteals() {
	Tracked::live = 0;
	{
		Array<Tracked> a;
		a.push(Tracked(1));
		a.push(Tracked(2));
		Array<Tracked> b = static_cast<Array<Tracked> &&>(a);
		CHECK(a.length() == 0); // moved-from is empty
		CHECK(b.length() == 2);
		b.push(Tracked(3));
		CHECK(b.length() == 3);
	}
	CHECK(Tracked::live == 0);
}

static void scenarioNoLeakAcrossChurn() {
	Tracked::live = 0;
	for (int round = 0; round < 50; round++) {
		Array<int> a;
		for (int i = 0; i < 40; i++) {
			a.push(i);
		}
		Array<int> b = a;
		for (int i = 0; i < 15; i++) {
			b.pop();
		}
		Array<int> c;
		c = a;
		c.push(999);
	}
	CHECK(Tracked::live == 0);
}

// Mutating content through a function parameter must reach the caller: the
// handle is copied (refcount +1), not the buffer. This is the TS alias model
// for Array (shared-mutable), explicitly NOT copy-on-write.
static void scenarioParamMutationReachesCaller() {
	Array<int> a{1, 2};
	mutateContentThroughParam(a);
	CHECK(a.length() == 3);
	CHECK(a[2] == 42);
	CHECK(a[0] == 7);
}

// Reassigning a function parameter only rebinds the LOCAL handle; the caller's
// array stays intact (binding vs content rule from todayPlan.md).
static void scenarioReassignParamIsLocal() {
	Array<int> a{5};
	rebindParam(a);
	CHECK(a.length() == 1);
	CHECK(a[0] == 5);
}

static void scenarioReassignParamNoLeak() {
	Tracked::live = 0;
	{
		Array<Tracked> a;
		a.push(Tracked(1));
		a.push(Tracked(2));
		takeAndRebindTracked(a);
		CHECK(a.length() == 2);
		CHECK(Tracked::live == 2); // only a's 2 elements remain after the call
	}
	CHECK(Tracked::live == 0);
}

// A returned handle transfers ownership exactly once (no double-acquire).
static void scenarioReturnTransfersOwnership() {
	Tracked::live = 0;
	{
		Array<Tracked> r = makeTrackedRange(3);
		CHECK(r.length() == 3);
		CHECK(Tracked::live == 3);
		r.push(Tracked(9));
		CHECK(Tracked::live == 4);
	}
	CHECK(Tracked::live == 0);
}

static void scenarioMakeRangeComposes() {
	Array<int> range = makeRange(3);
	CHECK(range.length() == 3);
	range.push(10);
	CHECK(range.length() == 4);
}

// Two handles to the same array: when one exits scope the other keeps the box
// alive; freeing happens only when the last handle is destroyed (no UAF, no
// premature free).
static void scenarioScopeExitOneOfTwoHandlesKeepsAlive() {
	Tracked::live = 0;
	{
		Array<Tracked> outer;
		outer.push(Tracked(1));
		{
			Array<Tracked> inner = outer; // share the box
			CHECK(Tracked::live == 1);
			inner.push(Tracked(2)); // writes through to the shared box
			CHECK(outer.length() == 2);
		} // inner dtor: refs 2 -> 1, box (and its elements) stay alive
		CHECK(Tracked::live == 2);
		CHECK(outer.length() == 2);
	} // outer dtor: last ref frees both elements
	CHECK(Tracked::live == 0);
}

static void scenarioCopyThroughFunctionBoundaryNoDoubleFree() {
	Tracked::live = 0;
	{
		Array<Tracked> a;
		a.push(Tracked(1));
		// Passing by value copies the handle (refs 2) and drops it on return
		// (refs 1). Re-running many times must not leak or double-free.
		for (int i = 0; i < 200; i++) {
			mutateContentThroughParam(Array<int>{}); // discard; also exercises eager empty arrays
		}
		CHECK(Tracked::live == 1);
	}
	CHECK(Tracked::live == 0);
}

int main() {
	scenarioEmptyArraysAreIndependent();
	scenarioReserveGrowsButNeverShrinks();
	scenarioCopySharesAlias();
	scenarioReassignIsLocal();
	scenarioPopReflectsOnAliasAndShrinks();
	scenarioCopyAssignReleasesOld();
	scenarioMoveSteals();
	scenarioNoLeakAcrossChurn();
	scenarioParamMutationReachesCaller();
	scenarioReassignParamIsLocal();
	scenarioReassignParamNoLeak();
	scenarioReturnTransfersOwnership();
	scenarioMakeRangeComposes();
	scenarioScopeExitOneOfTwoHandlesKeepsAlive();
	scenarioCopyThroughFunctionBoundaryNoDoubleFree();

	if (failures == 0) {
		printf("Array-on-Ref: all scenarios passed\n");
		return 0;
	}
	printf("Array-on-Ref: %d check(s) failed\n", failures);
	return 1;
}
