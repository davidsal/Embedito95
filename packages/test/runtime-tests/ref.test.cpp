// Host unit tests for the core_mem::Ref<T> refcount motor.
//
// These compile ref.h with the host toolchain (clang++) and run the refcount /
// leak / UAF scenarios the plan (todayPlan.md "tests de leak/UAF por
// escenario") requires at the motor level. Array<T>/String/object migration is
// not wired yet, so this exercises the Ref<T> RAII semantics directly.

#include "packages/registry/src/strategies/shared/memory/ref.h"

#include <stdio.h>

using core_mem::Ref;

// Value type that tracks how many live instances exist so leaks (a box that was
// never freed) surface as a nonzero count after a scenario's scope ends. It
// also poisons destroyed instances so a use-after-free is detectable.
struct Tracked {
	static int live;

	int id;
	bool alive;

	Tracked() : id(0), alive(true) {
		live++;
	}

	explicit Tracked(int value) : id(value), alive(true) {
		live++;
	}

	Tracked(const Tracked &other) : id(other.id), alive(true) {
		live++;
	}

	Tracked(Tracked &&other) : id(other.id), alive(true) {
		other.alive = false;
		live++;
	}

	Tracked &operator=(const Tracked &other) {
		id = other.id;
		return *this;
	}

	~Tracked() {
		alive = false;
		live--;
	}
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

static void scenarioSingleHandle() {
	Tracked::live = 0;
	{
		Ref<Tracked> value = Ref<Tracked>::emplace(123);
		CHECK(value.hasValue());
		CHECK(value.refCount() == 1);
		CHECK(value->id == 123);
		CHECK((*value).id == 123);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioCopyShares() {
	Tracked::live = 0;
	{
		Ref<Tracked> a = Ref<Tracked>::emplace(1);
		{
			Ref<Tracked> b = a;
			CHECK(a.refCount() == 2);
			CHECK(b.refCount() == 2);
			CHECK(Tracked::live == 1);
			// Mutable shared: mutating through one handle is seen by the other.
			a->id = 9;
			CHECK(b->id == 9);
		}
		// b left scope: one reference released, box still alive for a.
		CHECK(a.refCount() == 1);
		CHECK(a->id == 9);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioMoveConstructorSteals() {
	Tracked::live = 0;
	{
		Ref<Tracked> a = Ref<Tracked>::emplace(7);
		Ref<Tracked> b = static_cast<Ref<Tracked> &&>(a);
		CHECK(!a.hasValue());
		CHECK(b.refCount() == 1);
		CHECK(b->id == 7);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioCopyAssignReleasesOldAcquiresNew() {
	Tracked::live = 0;
	{
		Ref<Tracked> a = Ref<Tracked>::emplace(1);
		{
			Ref<Tracked> b = Ref<Tracked>::emplace(2);
			CHECK(Tracked::live == 2);
			b = a;
			// b's old box was released (freed), a acquired -> shared refs 2.
			CHECK(Tracked::live == 1);
			CHECK(a.refCount() == 2);
			CHECK(b.refCount() == 2);
			CHECK(b->id == 1);
		}
		CHECK(a.refCount() == 1);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioMoveAssignReleasesOld() {
	Tracked::live = 0;
	{
		Ref<Tracked> a = Ref<Tracked>::emplace(1);
		Ref<Tracked> b = Ref<Tracked>::emplace(2);
		CHECK(Tracked::live == 2);
		b = static_cast<Ref<Tracked> &&>(a);
		// b's old box freed; b adopted a's box; a is null.
		CHECK(!a.hasValue());
		CHECK(b.refCount() == 1);
		CHECK(b->id == 1);
		CHECK(Tracked::live == 1);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioSelfAssignCopyIsNoop() {
	Tracked::live = 0;
	{
		Ref<Tracked> a = Ref<Tracked>::emplace(5);
		Ref<Tracked> &alias = a;
		a = alias;
		CHECK(a.refCount() == 1);
		CHECK(a->id == 5);
		CHECK(Tracked::live == 1);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioMoveAssignAlreadyAliasing() {
	Tracked::live = 0;
	{
		Ref<Tracked> a = Ref<Tracked>::emplace(3);
		Ref<Tracked> b = a;
		CHECK(a.refCount() == 2);
		// b = move(a) where both already reference the same box: the box must
		// not be freed; only a's reference is dropped.
		b = static_cast<Ref<Tracked> &&>(a);
		CHECK(!a.hasValue());
		CHECK(b.refCount() == 1);
		CHECK(b->id == 3);
		CHECK(Tracked::live == 1);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioCloneIsIndependent() {
	Tracked::live = 0;
	{
		Ref<Tracked> a = Ref<Tracked>::emplace(4);
		Ref<Tracked> b = a.clone();
		CHECK(a.refCount() == 1);
		CHECK(b.refCount() == 1);
		CHECK(Tracked::live == 2);
		// Writing to the clone does not affect the original (CoW divergence).
		b->id = 40;
		CHECK(a->id == 4);
		CHECK(b->id == 40);
	}
	CHECK(Tracked::live == 0);

}

static void scenarioTwoHandlesOneLeavesScope() {
	Tracked::live = 0;
	{
		Ref<Tracked> keeper;
		{
			Ref<Tracked> tmp = Ref<Tracked>::emplace(11);
			keeper = tmp;
			CHECK(keeper.refCount() == 2);
			CHECK(Tracked::live == 1);
		}
		// tmp left scope: refcount down but keeper's box still valid (no UAF).
		CHECK(keeper.refCount() == 1);
		CHECK(keeper->id == 11);
		CHECK(keeper->alive);
	}
	CHECK(Tracked::live == 0);

}

int main() {
	scenarioSingleHandle();
	scenarioCopyShares();
	scenarioMoveConstructorSteals();
	scenarioCopyAssignReleasesOldAcquiresNew();
	scenarioMoveAssignReleasesOld();
	scenarioSelfAssignCopyIsNoop();
	scenarioMoveAssignAlreadyAliasing();
	scenarioCloneIsIndependent();
	scenarioTwoHandlesOneLeavesScope();

	if (failures == 0) {
		printf("Ref motor: all scenarios passed\n");
		return 0;
	}
	printf("Ref motor: %d check(s) failed\n", failures);
	return 1;
}
