// Host unit tests for the C++ shapes the codegen emits for nullable truthiness
// and the logical operators (??, ||, &&).
//
// The snapshot tests never compile the generated C++, so this is the only place
// where the emitted short-circuit and single-evaluation patterns are actually
// executed: a side-effecting operand must run at most once, and the right
// operand of a short-circuited ??/||/&& must not run at all.

#include <stdio.h>

static int failures = 0;

#define CHECK(cond)                                                              \
	do {                                                                          \
		if (!(cond)) {                                                              \
			failures++;                                                               \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);                   \
		}                                                                           \
	} while (0)

// Mirrors the runtime `nullable<T>` (strategies/*/type/type.h) field names so
// the emitted `x.isNull` / `x.value` patterns are the ones under test. It cannot
// include type.h directly because that header pulls in <Arduino.h>.
template <typename T> struct nullable {
	bool isNull;
	T value;
};

// Models the emitted string truthiness check `s.length() != 0`.
struct text {
	unsigned len;
	unsigned length() const { return len; }
};

// Side-effect counter: proves an operand is evaluated at most once.
static int calls = 0;
static int counted(int value) {
	calls++;
	return value;
}

static void scenarioNullishCoalescingReturnsLeftAndSkipsRight() {
	nullable<int> a{false, 5};
	calls = 0;
	int r = (a.isNull ? counted(99) : a.value);
	CHECK(r == 5);
	CHECK(calls == 0);
}

static void scenarioNullishCoalescingFallsBackWhenNull() {
	nullable<int> a{true, 0};
	calls = 0;
	int r = (a.isNull ? counted(7) : a.value);
	CHECK(r == 7);
	CHECK(calls == 1);
}

static void scenarioNullishCoalescingChainFoldsOnce() {
	nullable<int> a{true, 0};
	nullable<int> b{true, 0};
	int c = 42;
	int r = (a.isNull ? (b.isNull ? c : b.value) : a.value);
	CHECK(r == 42);
}

static void scenarioOrReturnsOperandAndShortCircuits() {
	calls = 0;
	int zero = 0;
	int r = (zero != 0 ? zero : counted(5));
	CHECK(r == 5);
	CHECK(calls == 1);

	calls = 0;
	int three = 3;
	int s = (three != 0 ? three : counted(5));
	CHECK(s == 3);
	CHECK(calls == 0);
}

static void scenarioAndReturnsOperandAndShortCircuits() {
	calls = 0;
	int zero = 0;
	int r = (zero != 0 ? counted(5) : zero);
	CHECK(r == 0);
	CHECK(calls == 0);

	calls = 0;
	int three = 3;
	int s = (three != 0 ? counted(5) : three);
	CHECK(s == 5);
	CHECK(calls == 1);
}

static void scenarioNullableTruthiness() {
	nullable<int> present{false, 3};
	nullable<int> zero{false, 0};
	nullable<int> absent{true, 0};
	CHECK((!present.isNull && present.value != 0));
	CHECK(!(!zero.isNull && zero.value != 0));
	CHECK(!(!absent.isNull && absent.value != 0));

	nullable<bool> flag{false, true};
	CHECK((!flag.isNull && flag.value));
}

static void scenarioStringTruthiness() {
	text empty{0};
	text filled{4};
	CHECK(!(empty.length() != 0));
	CHECK(filled.length() != 0);
}

static void scenarioSingleEvaluationWithTemporary() {
	calls = 0;
	// Emitted shape for `f() || 9` when `f()` has side effects:
	//   ({ auto _e95_t0 = f(); (_e95_t0 != 0 ? _e95_t0 : 9); })
	int r = ({
		auto _e95_t0 = counted(0);
		(_e95_t0 != 0 ? _e95_t0 : 9);
	});
	CHECK(r == 9);
	CHECK(calls == 1);

	calls = 0;
	int s = ({
		auto _e95_t0 = counted(7);
		(_e95_t0 != 0 ? _e95_t0 : 9);
	});
	CHECK(s == 7);
	CHECK(calls == 1);
}

static void scenarioNullableResultWrap() {
	nullable<int> a{false, 5};
	nullable<int> wrapped =
		(a.isNull ? nullable<int>{true, 0} : nullable<int>{false, a.value});
	CHECK(!wrapped.isNull);
	CHECK(wrapped.value == 5);
}

int main() {
	scenarioNullishCoalescingReturnsLeftAndSkipsRight();
	scenarioNullishCoalescingFallsBackWhenNull();
	scenarioNullishCoalescingChainFoldsOnce();
	scenarioOrReturnsOperandAndShortCircuits();
	scenarioAndReturnsOperandAndShortCircuits();
	scenarioNullableTruthiness();
	scenarioStringTruthiness();
	scenarioSingleEvaluationWithTemporary();
	scenarioNullableResultWrap();

	if (failures == 0) {
		printf("Logical-operators: all scenarios passed\n");
		return 0;
	}
	printf("Logical-operators: %d check(s) failed\n", failures);
	return 1;
}
