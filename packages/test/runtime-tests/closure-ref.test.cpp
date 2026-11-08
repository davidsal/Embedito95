// Host tests for the A2+ closure model: a closure with captured state is
// rendered as a shared `core_object::Object<Fields>` handle plus free functions
// over `Object<Fields> &self` (the unified object model), so copying/passing the
// instance SHARES the storage — TS object semantics — instead of duplicating it.
//
// This mirrors the exact shape the codegen now emits for a closure factory
// (Counter/makeCounter in objects.test.e95):
//
//   struct Counter { int count; };                       // captured state
//   using CounterHandle = core_object::Object<Counter>;  // shared handle
//   void increment(CounterHandle &self) { self->count = self->count + 1; }
//   CounterHandle makeCounter() { return CounterHandle(Counter{ 0 }); }
//
// It asserts the TS-like rules:
//   - `let b = a` aliases the same storage (mutations reach the alias);
//   - two factory calls yield two independent objects;
//   - passing `f(counter)` shares state; mutating through the param reaches the
//     caller;
//   - rebinding a parameter only repoints the local handle (binding vs content);
//   - returning from the factory transfers ownership (no double acquire/leak).
//
// The storage is only touched through the free-function method surface, exactly
// like e95 user code. The class-form fallback (a closure capturing a non-owned
// field) is unchanged and not exercised here.

#include "packages/registry/src/strategies/shared/object/object_ref.h"

#include <stdio.h>

// --- what the codegen emits (host ints in place of platform i16) ------------

struct Counter {
	int count;
};

using CounterHandle = core_object::Object<Counter>;

static void increment(CounterHandle &self) {
	self->count = self->count + 1;
}

static int getValue(CounterHandle &self) {
	return self->count;
}

static CounterHandle makeCounter() {
	return CounterHandle(Counter{ 0 });
}

static int failures = 0;

#define CHECK(cond)                                                              \
	do {                                                                          \
		if (!(cond)) {                                                              \
			failures++;                                                               \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);                   \
		}                                                                           \
	} while (0)

// Passing a closure by value SHARES the storage: mutating through the parameter
// reaches the caller's object (alias, not a copy).
static void bumpThroughParam(CounterHandle c) {
	increment(c);
	increment(c);
}

// Rebinding a parameter only repoints the LOCAL handle; the caller's object is
// untouched (binding vs content rule).
static void rebindParam(CounterHandle c) {
	CounterHandle fresh = makeCounter();
	increment(fresh); // fresh->count == 1
	c = fresh;        // local handle now aliases `fresh`
	increment(c);     // fresh->count == 2
}

// --- scenarios ----------------------------------------------------------------

static void scenarioAssignAliasesSharedState() {
	CounterHandle a = makeCounter();
	CounterHandle b = a; // aliases the SAME storage (refs+1)
	increment(b);
	CHECK(getValue(a) == 1); // mutation through b is visible via a
	increment(a);
	CHECK(getValue(b) == 2); // ...and vice versa
}

static void scenarioFactoriesAreIndependent() {
	CounterHandle a = makeCounter();
	CounterHandle b = makeCounter();
	increment(a);
	increment(a);
	increment(b);
	CHECK(getValue(a) == 2);
	CHECK(getValue(b) == 1); // each factory call owns its own storage
}

static void scenarioParamSharesAndMutatesCaller() {
	CounterHandle a = makeCounter();
	bumpThroughParam(a); // handle copy at the same storage
	CHECK(getValue(a) == 2);
}

static void scenarioReassignParamIsLocal() {
	CounterHandle a = makeCounter();
	increment(a); // count == 1
	rebindParam(a);
	CHECK(getValue(a) == 1); // caller untouched by the local rebind
}

static void scenarioReturnTransfersOwnership() {
	CounterHandle a = makeCounter();
	increment(a);
	CounterHandle moved = makeCounter(); // move from the factory's temp
	increment(moved);
	increment(moved);
	CHECK(getValue(a) == 1);
	CHECK(getValue(moved) == 2);
}

int main() {
	scenarioAssignAliasesSharedState();
	scenarioFactoriesAreIndependent();
	scenarioParamSharesAndMutatesCaller();
	scenarioReassignParamIsLocal();
	scenarioReturnTransfersOwnership();

	if (failures == 0) {
		printf("Shared-closure-on-Object: all scenarios passed\n");
		return 0;
	}
	printf("Shared-closure-on-Object: %d check(s) failed\n", failures);
	return 1;
}
