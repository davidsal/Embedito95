// CORE
#include "core/system/core_system.h"
#include "core/type/core_type.h"

struct Box {
	i32 count;
	f32 ratio;
};

void report(i32 intValue, f32 floatValue, i32 added, f32 restored, i16 truncated) {

}

void funI(i32 x) {

}

void funF(f32 x) {

}

void computeArguments() {
	funI((i32)(500.0));
	funI((i32)(1.5f));
	funF(500.0f);
	core_object::Object<Box> box = core_object::Object<Box>(Box{ 0, 0 });
	box->count = (i32)(500.0);
	box->count = (i32)(1.5f);
	box->ratio = 500.0f;
}

void computeContextualCast() {
	const i32 sensorValue = 100;
	const i32 temperature = ((i32)(sensorValue) * (i32)(500.0)) / (i32)(1023);
	const f32 temperature2 = ((f32)((i32)(sensorValue)) * 500.0f) / (f32)(1023.0f);
	const i32 added = 3;
	const f32 restored = 3.0f;
	const i16 truncated = 1.5f;

	report(temperature, temperature2, added, restored, truncated);
}

int main() {
	// SETUP
	initializeSystemClock();

	// MAIN
	computeArguments();
	computeContextualCast();
}
