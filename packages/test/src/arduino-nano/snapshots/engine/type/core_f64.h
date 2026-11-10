#ifndef _E95_F64_H
#define _E95_F64_H

#include <stdint.h>

// Portable IEEE-754 binary64 value for targets whose compiler `double` is
// narrower than 64 bits (for example AVR, where `double` is 32 bits). The
// representation is the raw binary64 bit pattern, so literals can be emitted
// bit-exactly with `fromBits` instead of going through the target `double`.
struct _e95_f64 {
	uint64_t bits;

	_e95_f64();
	explicit _e95_f64(signed char value);
	explicit _e95_f64(unsigned char value);
	explicit _e95_f64(short value);
	explicit _e95_f64(unsigned short value);
	explicit _e95_f64(int value);
	explicit _e95_f64(unsigned int value);
	explicit _e95_f64(long value);
	explicit _e95_f64(unsigned long value);
	explicit _e95_f64(long long value);
	explicit _e95_f64(unsigned long long value);
	explicit _e95_f64(float value);
	explicit _e95_f64(double value);

	static _e95_f64 fromBits(uint32_t high, uint32_t low);

	explicit operator bool() const;
	explicit operator char() const;
	explicit operator signed char() const;
	explicit operator unsigned char() const;
	explicit operator short() const;
	explicit operator unsigned short() const;
	explicit operator int() const;
	explicit operator unsigned int() const;
	explicit operator long() const;
	explicit operator unsigned long() const;
	explicit operator long long() const;
	explicit operator unsigned long long() const;
	operator float() const;

	_e95_f64 operator-() const;
	_e95_f64 operator+(const _e95_f64 &other) const;
	_e95_f64 operator-(const _e95_f64 &other) const;
	_e95_f64 operator*(const _e95_f64 &other) const;
	_e95_f64 operator/(const _e95_f64 &other) const;

	_e95_f64 &operator+=(const _e95_f64 &other);
	_e95_f64 &operator-=(const _e95_f64 &other);
	_e95_f64 &operator*=(const _e95_f64 &other);
	_e95_f64 &operator/=(const _e95_f64 &other);

	bool operator==(const _e95_f64 &other) const;
	bool operator!=(const _e95_f64 &other) const;
	bool operator<(const _e95_f64 &other) const;
	bool operator>(const _e95_f64 &other) const;
	bool operator<=(const _e95_f64 &other) const;
	bool operator>=(const _e95_f64 &other) const;
};

#endif
