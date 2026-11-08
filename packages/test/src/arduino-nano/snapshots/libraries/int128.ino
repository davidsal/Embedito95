// CORE
#include <core_system.h>
#include <core_type.h>

void testInt128() {
	i128 big = 1000000;
	i128 small = 7;

	big = big + small;
	big = big * small;
	big = big / small;
	big = big % small;
	big = big - small;

	u128 unsignedValue = 5000;
	unsignedValue = (u128)((i128)(unsignedValue) + (i128)(100));
	unsignedValue = (u128)((i128)(unsignedValue) * (i128)(2));
	unsignedValue = (u128)((i128)(unsignedValue) / (i128)(3));
	unsignedValue = (u128)((i128)(unsignedValue) % (i128)(4));

	i128 negative = -100;
	negative = negative + (i128)(5);
	negative = negative / (i128)(2);

	if (big >= small) {
		big = big - (i128)(1);
	}
	if (negative < (i128)(0)) {
		negative = negative * (i128)(-1);
	}
}

void setup() {
	testInt128();
}

void loop() {
}
