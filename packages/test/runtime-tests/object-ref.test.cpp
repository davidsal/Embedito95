// Host unit tests for the candidate shared-mutable object handle backed by the
// core_mem::Ref motor (strategies/shared/object/object_ref.h).
//
// Objects are heterogeneous, so this exercises core_object::Object<Fields> with
// the per-shape fields structs the codegen will emit, plus real nested fields
// (Array<int>/Array<Tracked> and String mirrors) to prove:
//   - assignment `let b = a` aliases the same storage (NOT a deep copy);
//   - passing `f(obj)` passes the handle; mutating fields reaches the caller;
//   - reassigning a parameter / binding is LOCAL (binding vs content);
//   - reference-type fields (array/object) are stored as handles, so copying an
//     object SHARES the nested object (identity preserved, no deep copy);
//   - freeing the root releases every nested handle in cascade (no leak);
//   - OOM/move/copy-assign never double-free or leak (checked via ASan/UBSan and
//     a live-element counter).
// Self-referencing cycles are deliberately NOT tested (see object_ref.h): they
// leak under a plain refcount and are a documented unsupported case.

#include "packages/registry/src/strategies/shared/array/array_ref.h"
#include "packages/registry/src/strategies/shared/object/object_ref.h"
#include "packages/registry/src/strategies/shared/string/string_ref.h"

#include <stdio.h>
#include <utility>

using core_object::Object;
using core_array::Array;
using core_string::String;

// Counts live elements so an undestroyed array/storage (leak) surfaces as a
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

// --- per-shape storage structs (what renderAnonymousObjectType will emit) ----

struct PointFields {
	int x;
	int y;

	PointFields() : x(0), y(0) {}
};
using Point = Object<PointFields>;

struct InnerFields {
	int id;
	Array<Tracked> items;

	InnerFields() : id(0) {}
};
using Inner = Object<InnerFields>;

// A mid object that (a) owns elements of its own and (b) owns a nested `Inner`
// object as a handle — the two ways nested state escapes the root.
struct MidFields {
	int id;
	Array<Tracked> items;
	Inner inner;
	String label;

	MidFields() : id(0), label("") {}
};
using Mid = Object<MidFields>;

// --- free-function helpers modelling the TS pass-by-handle boundary ---------

// Receives a Point by value: a copy of the handle (refs+1) at the SAME storage.
// Writing fields through the handle reaches the caller (alias, not CoW).
static void mutateFieldsThroughParam(Point p) {
	p->x = 7;
	p->y = 9;
}

static void mutateObjectContentThroughParam(Mid m) {
	m->id = 100;
	m->items.push(Tracked(1));
	m->inner->items.push(Tracked(2));
}

// Rebinding a parameter only repoints the LOCAL handle; the caller's object
// (and everything it owns) stays intact.
static void rebindParam(Point p) {
	Point fresh;
	fresh->x = 111;
	p = fresh; // local handle now aliases `fresh`
	p->x = 222;
}

static void rebindMidParam(Mid m) {
	Mid fresh;
	fresh->id = 999;
	m = fresh; // releases m's share of the caller storage (caller still holds it)
}

static Mid makeMid() {
	Mid result;
	result->id = 5;
	result->label = "mid";
	return result; // transferred by move, no double-acquire
}

// --- scenarios ---------------------------------------------------------------

static void scenarioAssignAliasesSameStorage() {
	Point a;
	a->x = 1;
	a->y = 2;
	Point b = a;
	CHECK(a.isSame(b));
	CHECK(b.refCount() == 2);
	// Mutating through one handle is visible through the other (alias).
	b->x = 9;
	CHECK(a->x == 9);
	a->y = 42;
	CHECK(b->y == 42);
}

static void scenarioSeparateObjectsAreIndependent() {
	Point a;
	Point b;
	a->x = 1;
	b->x = 2;
	CHECK(!a.isSame(b));
	CHECK(a->x == 1);
	CHECK(b->x == 2);
	CHECK(a.refCount() == 1);
	CHECK(b.refCount() == 1);
}

static void scenarioParamMutationReachesCaller() {
	Point a;
	mutateFieldsThroughParam(a);
	CHECK(a->x == 7);
	CHECK(a->y == 9);

	Tracked::live = 0;
	{
		Mid m;
		mutateObjectContentThroughParam(m); // reaches caller + frees no nested handle
		CHECK(m->id == 100);
		CHECK(m->items.length() == 1);
		CHECK(m->inner->items.length() == 1);
		CHECK(Tracked::live == 2);
	}
	CHECK(Tracked::live == 0);
}

// Reassigning a parameter only rebinds the local handle; the caller object is
// untouched (binding vs content rule).
static void scenarioReassignParamIsLocal() {
	Point a;
	a->x = 5;
	rebindParam(a);
	CHECK(a->x == 5); // caller untouched

	Tracked::live = 0;
	{
		Mid m;
		m->items.push(Tracked(1));
		m->items.push(Tracked(2));
		rebindMidParam(m);
		CHECK(m->id != 999); // still the caller's object
		CHECK(m->items.length() == 2);
		CHECK(Tracked::live == 2); // caller's 2 elements survive the call
	}
	CHECK(Tracked::live == 0);
}

static void scenarioCopySharesNestedObjectIdentity() {
	Mid a;
	a->inner->id = 3;
	Mid b = a; // aliases the SAME storage
	CHECK(a.isSame(b));
	// The nested object is stored as a handle: copying the mid does NOT deep
	// copy its inner object — b's inner is the very same Inner as a's.
	CHECK(a->inner.isSame(b->inner));
	CHECK(a->inner.refCount() == 1); // only ever one Inner, owned by the storage
	b->inner->id = 9;
	CHECK(a->inner->id == 9);
}

static void scenarioFieldRebindReleasesOldNested() {
	Tracked::live = 0;
	{
		Mid a;
		a->inner->items.push(Tracked(1));
		a->items.push(Tracked(2));
		CHECK(Tracked::live == 2);

		// Reassign the whole object to a fresh one: the old storage (and the old
		// Inner object + its elements) must be released.
		a = Mid();
		CHECK(Tracked::live == 0);
		CHECK(a->inner.refCount() == 1);
	}
	CHECK(Tracked::live == 0);
}

static void scenarioCopyAssignReleasesOld() {
	Tracked::live = 0;
	{
		Mid a;
		a->items.push(Tracked(1));
		a->inner->items.push(Tracked(2));
		Mid b;
		b->items.push(Tracked(9));
		b = a; // b releases its old storage (with the 9)
		CHECK(a.isSame(b));
		CHECK(b->items.length() == 1);
		CHECK(b->inner->items.length() == 1);
	}
	CHECK(Tracked::live == 0);
}

// Freeing the root object frees, in cascade, the elements of its own array AND
// the nested Inner object (its handle) and that Inner's array elements. A copy
// of the root does not duplicate any nested state; the last handle to the root
// releases everything once.
static void scenarioNestedCascadeRelease() {
	Tracked::live = 0;
	{
		Mid a;
		a->items.push(Tracked(1));
		a->items.push(Tracked(2)); // 2 owned by a
		a->inner->items.push(Tracked(3));
		a->inner->items.push(Tracked(4));
		a->inner->items.push(Tracked(5)); // 3 owned by a->inner
		CHECK(Tracked::live == 5);

		{
			Mid alias = a; // shares storage; does NOT copy inner/arrays
			CHECK(a.isSame(alias));
			CHECK(Tracked::live == 5);
			alias->items.push(Tracked(6)); // write-through on the shared storage
			CHECK(Tracked::live == 6);
			CHECK(a->items.length() == 3);
		} // alias gone: refs 2 -> 1, everything still alive

		CHECK(Tracked::live == 6);
		CHECK(a->items.length() == 3);
		CHECK(a->inner->items.length() == 3);
	} // a gone: last ref frees storage -> arrays freed -> inner freed -> its array freed
	CHECK(Tracked::live == 0);
}

static void scenarioScopeExitOneOfTwoKeepsAlive() {
	Tracked::live = 0;
	{
		Mid outer;
		outer->items.push(Tracked(1));
		{
			Mid inner = outer; // share storage
			CHECK(inner.refCount() == 2);
			CHECK(Tracked::live == 1);
		} // inner dtor: refs 2 -> 1; storage (and inner object + elements) alive
		CHECK(Tracked::live == 1);
		CHECK(outer->items.length() == 1);
	} // outer dtor: last ref frees the whole cascade
	CHECK(Tracked::live == 0);
}

static void scenarioReturnTransfersOwnership() {
	Tracked::live = 0;
	{
		Mid r = makeMid();
		CHECK(r->id == 5);
		CHECK(r->label == "mid");
		r->inner->items.push(Tracked(7));
		CHECK(Tracked::live == 1);
	}
	CHECK(Tracked::live == 0);
}

static void scenarioNoLeakAcrossChurn() {
	Tracked::live = 0;
	for (int round = 0; round < 200; round++) {
		Mid a;
		for (int i = 0; i < 5; i++) {
			a->items.push(Tracked(i));
			a->inner->items.push(Tracked(i + 100));
		}
		Mid b = a;
		b->inner = Inner(); // release the nested object under alias, replace
		Mid c;
		c = a;
		c->items.pop();
	}
	CHECK(Tracked::live == 0);
}

int main() {
	scenarioAssignAliasesSameStorage();
	scenarioSeparateObjectsAreIndependent();
	scenarioParamMutationReachesCaller();
	scenarioReassignParamIsLocal();
	scenarioCopySharesNestedObjectIdentity();
	scenarioFieldRebindReleasesOldNested();
	scenarioCopyAssignReleasesOld();
	scenarioNestedCascadeRelease();
	scenarioScopeExitOneOfTwoKeepsAlive();
	scenarioReturnTransfersOwnership();
	scenarioNoLeakAcrossChurn();

	if (failures == 0) {
		printf("Object-on-Ref: all scenarios passed\n");
		return 0;
	}
	printf("Object-on-Ref: %d check(s) failed\n", failures);
	return 1;
}
