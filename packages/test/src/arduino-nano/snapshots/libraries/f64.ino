// CORE
#include <core_system.h>
#include <core_type.h>

f64 computeSum() {
	const f64 left = f64::fromBits(0x3fb99999u, 0x9999999au);
	const f64 right = f64::fromBits(0x3fc99999u, 0x9999999au);
	return left + right;
}

f64 computeQuotient() {
	const f64 numerator = f64::fromBits(0x3ff00000u, 0x00000000u);
	const f64 denominator = f64::fromBits(0x40080000u, 0x00000000u);
	return numerator / denominator;
}

f64 computeProduct() {
	f64 value = f64::fromBits(0x3ff80000u, 0x00000000u);
	value = value * (f64)(f64::fromBits(0x40000000u, 0x00000000u));
	value = value - (f64)(f64::fromBits(0x3fe00000u, 0x00000000u));
	return value;
}

boolean compareValues() {
	const f64 sum = f64::fromBits(0x3fd33333u, 0x33333334u);
	const f64 same = f64::fromBits(0x3fd33333u, 0x33333333u);
	return sum == same;
}

f64 convertValue() {
	const i32 integer = 42;
	return ((f64)(integer));
}

f64 initFromInteger() {
	const f64 zero = f64::fromBits(0x00000000u, 0x00000000u);
	const f64 one = f64::fromBits(0x3ff00000u, 0x00000000u);
	return zero + one;
}

f64 literalReturn() {
	return f64::fromBits(0x40040000u, 0x00000000u);
}

f64 integerReturn() {
	return f64::fromBits(0x40450000u, 0x00000000u);
}

f64 sumLiterals() {
	return (f64)(f64::fromBits(0x3fb99999u, 0x9999999au)) + (f64)(f64::fromBits(0x3fc99999u, 0x9999999au));
}

f64 inferPrecisionReturn() {
	return f64::fromBits(0x3fd33333u, 0x33333334u);
}

f64 inferMaximumReturn() {
	return f64::fromBits(0x7fe1ccf3u, 0x85ebc8a0u);
}

f64 incrementByOne(f64 value) {
	return value + (f64)(f64::fromBits(0x3ff00000u, 0x00000000u));
}

f64 foldedMaximumProduct() {
	const f64 maximum = f64::fromBits(0x7fe1ccf3u, 0x85ebc8a0u);
	return maximum;
}

void takeValue(f64 value) {
	return;
}

void passLiterals() {
	takeValue(f64::fromBits(0x3ff00000u, 0x00000000u));
	takeValue(f64::fromBits(0x40040000u, 0x00000000u));
	return;
}

void setup() {
	computeSum();
	computeQuotient();
	computeProduct();
	compareValues();
	convertValue();
	initFromInteger();
	literalReturn();
	integerReturn();
	sumLiterals();
	inferPrecisionReturn();
	inferMaximumReturn();
	incrementByOne(f64::fromBits(0x3ff00000u, 0x00000000u));
	foldedMaximumProduct();
	passLiterals();
}

void loop() {
}
