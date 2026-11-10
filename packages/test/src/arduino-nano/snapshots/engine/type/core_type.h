#ifndef _E95_TYPE_H
#define _E95_TYPE_H

#include <Arduino.h>
#include <avr/pgmspace.h>
#include <stdint.h>
#include <stdlib.h>

#include <core_f64.h>
using u64 = uint64_t;
using i8 = int8_t;
using i16 = int16_t;
using i32 = int32_t;
using i64 = int64_t;
using f32 = float;
using f64 = _e95_f64;

// Nullable wrapper for any type, provided once by the runtime so the codegen
// does not need to regenerate it per project/library.
template<typename T> struct nullable {
	boolean isNull;
	T value;
};

#include <core_array.h>
#include <core_int128.h>
#include <core_string.h>
#include <core_object.h>

#endif
