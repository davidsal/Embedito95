// CORE
#include "core/system/core_system.h"
#include "core/type/core_type.h"

i32 computeRatio() {
	u8 a = 200;
	u8 b = 100;
	f32 c = 3.0f;

	const f32 viaCast = ((f32)(((i32)(a) + (i32)(b)))) / c;
	const f32 viaFloatOperand = (f32)(((i32)(a) + (i32)(b))) / c;
	const i32 integerFirst = ((i32)(a) + (i32)(b)) / (i32)(c);

	return (i32)((viaCast + viaFloatOperand)) + integerFirst;
}

f32 computeAccumulation() {
	f32 total = 0.0f;
	i16 step = 1;

	total = total + (f32)(step);
	total = total + ((f32)(step));
	total = 255.0f;
	total = 0.0f;
	return total;
}

int main() {
	// SETUP
	initializeSystemClock();

	// MAIN
	computeRatio();
	computeAccumulation();
}
