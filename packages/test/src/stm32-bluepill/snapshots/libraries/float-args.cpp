// CORE
#include "core/system/core_system.h"
#include "core/type/core_type.h"

f32 combine(f32 a, f32 b) {
	return (a * 2.0) + b;
}

int main() {
	// SETUP
	initializeSystemClock();

	// MAIN
	const f32 base = 2.5f;
	const u8 whole = 3;

	const f32 fromFloat = combine(base, 1.5f);
	const f32 coerced = combine(base, whole);
	const f32 fromIntLiteral = combine(4.0f, 0.5f);

	combine((fromFloat + coerced), fromIntLiteral);
	combine(base, coerced);
}
