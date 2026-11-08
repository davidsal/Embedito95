#ifndef _E95_INT128_H
#define _E95_INT128_H

#include "core_string.h"

// 128-bit integer support (portable software implementation for
// toolchains without native __int128, e.g. AVR and ARM Cortex-M)
struct u128 {
	u64 lo;
	u64 hi;

	u128() : lo(0), hi(0) {}
	u128(u64 value) : lo(value), hi(0) {}
	u128(u64 high, u64 low) : lo(low), hi(high) {}

	operator boolean() const { return lo != 0 || hi != 0; }
	operator char() const { return (char)lo; }
	operator i8() const { return (i8)lo; }
	operator u8() const { return (u8)lo; }
	operator i16() const { return (i16)lo; }
	operator u16() const { return (u16)lo; }
	operator i32() const { return (i32)lo; }
	operator u32() const { return (u32)lo; }
	operator i64() const { return (i64)lo; }
	operator u64() const { return lo; }
	operator f32() const;
	operator double() const;
};

struct i128 {
	u128 value;

	i128() : value() {}
	i128(i64 number) {
		if (number < 0) {
			value = u128(~0ULL, (u64)number);
		} else {
			value = u128(0, (u64)number);
		}
	}
	i128(u128 raw) : value(raw) {}

	operator boolean() const { return value.lo != 0 || value.hi != 0; }
	operator char() const { return (char)value.lo; }
	operator i8() const { return (i8)value.lo; }
	operator u8() const { return (u8)value.lo; }
	operator i16() const { return (i16)value.lo; }
	operator u16() const { return (u16)value.lo; }
	operator i32() const { return (i32)value.lo; }
	operator u32() const { return (u32)value.lo; }
	operator i64() const { return (i64)value.lo; }
	operator u64() const { return value.lo; }
	operator f32() const;
	operator double() const;
};

// u128 operators
u128 operator+(u128 a, u128 b);
u128 operator-(u128 a, u128 b);
u128 operator*(u128 a, u128 b);
u128 operator/(u128 a, u128 b);
u128 operator%(u128 a, u128 b);
u128 operator<<(u128 value, u128 shift);
u128 operator>>(u128 value, u128 shift);
boolean operator==(u128 a, u128 b);
boolean operator!=(u128 a, u128 b);
boolean operator<(u128 a, u128 b);
boolean operator>(u128 a, u128 b);
boolean operator<=(u128 a, u128 b);
boolean operator>=(u128 a, u128 b);
u128 operator&(u128 a, u128 b);
u128 operator|(u128 a, u128 b);
u128 operator^(u128 a, u128 b);
u128 operator~(u128 a);
u128& operator+=(u128& a, u128 b);
u128& operator-=(u128& a, u128 b);
u128& operator*=(u128& a, u128 b);
u128& operator/=(u128& a, u128 b);
u128& operator%=(u128& a, u128 b);
u128& operator<<=(u128& a, u128 shift);
u128& operator>>=(u128& a, u128 shift);
u128& operator&=(u128& a, u128 b);
u128& operator|=(u128& a, u128 b);
u128& operator^=(u128& a, u128 b);

// i128 operators
i128 operator+(i128 a, i128 b);
i128 operator-(i128 a, i128 b);
i128 operator*(i128 a, i128 b);
i128 operator/(i128 a, i128 b);
i128 operator%(i128 a, i128 b);
i128 operator-(i128 a);
i128 operator+(i128 a);
boolean operator==(i128 a, i128 b);
boolean operator!=(i128 a, i128 b);
boolean operator<(i128 a, i128 b);
boolean operator>(i128 a, i128 b);
boolean operator<=(i128 a, i128 b);
boolean operator>=(i128 a, i128 b);
i128 operator<<(i128 a, i128 shift);
i128 operator>>(i128 a, i128 shift);
i128 operator&(i128 a, i128 b);
i128 operator|(i128 a, i128 b);
i128 operator^(i128 a, i128 b);
i128 operator~(i128 a);
i128& operator+=(i128& a, i128 b);
i128& operator-=(i128& a, i128 b);
i128& operator*=(i128& a, i128 b);
i128& operator/=(i128& a, i128 b);
i128& operator%=(i128& a, i128 b);
i128& operator<<=(i128& a, i128 shift);
i128& operator>>=(i128& a, i128 shift);
i128& operator&=(i128& a, i128 b);
i128& operator|=(i128& a, i128 b);
i128& operator^=(i128& a, i128 b);

#endif
