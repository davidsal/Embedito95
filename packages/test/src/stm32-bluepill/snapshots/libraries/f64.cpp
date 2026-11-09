// CORE
#include "core/system/core_system.h"
#include "core/type/core_type.h"

f64 computeSum() {
	const f64 left = 0.1;
	const f64 right = 0.2;
	return left + right;
}

f64 computeQuotient() {
	const f64 numerator = 1;
	const f64 denominator = 3;
	return numerator / denominator;
}

f64 computeProduct() {
	f64 value = 1.5;
	value = value * (f64)(2);
	value = value - (f64)(0.5);
	return value;
}

boolean compareValues() {
	const f64 sum = 0.30000000000000004;
	const f64 same = 0.3;
	return sum == same;
}

f64 convertValue() {
	const i32 integer = 42;
	return ((f64)(integer));
}

f64 initFromInteger() {
	const f64 zero = 0;
	const f64 one = 1;
	return zero + one;
}

f64 literalReturn() {
	return 2.5;
}

f64 integerReturn() {
	return 42;
}

f64 sumLiterals() {
	return (f64)(0.1) + (f64)(0.2);
}

f64 inferPrecisionReturn() {
	return 0.30000000000000004;
}

f64 inferMaximumReturn() {
	return 1e+308;
}

f64 incrementByOne(f64 value) {
	return value + (f64)(1);
}

f64 foldedMaximumProduct() {
	const f64 maximum = 1e+308;
	return maximum;
}

void takeValue(f64 value) {
	return;
}

void passLiterals() {
	takeValue(1);
	takeValue(2.5);
	return;
}

int main() {
	// SETUP
	initializeSystemClock();

	// MAIN
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
	incrementByOne(1);
	foldedMaximumProduct();
	passLiterals();
}
