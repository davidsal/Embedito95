#ifndef _E95_TYPE_H
#define _E95_TYPE_H

#include <stdint.h>

using u8 = uint8_t;
using i8 = int8_t;
using u16 = uint16_t;
using i16 = int16_t;
using u32 = uint32_t;
using i32 = int32_t;
using u64 = uint64_t;
using i64 = int64_t;
using f32 = float;
using f64 = double;
using i128 = __int128;
using u128 = unsigned __int128;
using boolean = bool;

// Nullable wrapper for any type, provided once by the runtime so the codegen
// does not need to regenerate it per project/library.
template<typename T> struct nullable {
	boolean isNull;
	T value;
};

// Runtime umbrella for host codegen: dynamic arrays and strings are language
// types, so the host type header pulls their runtimes in the same way the
// embedded type headers do. `array` comes first because `string` declares
// `core_array::Array<T>` in its public surface.
#include "core_array.h"
#include "core_string.h"
#include "core_object.h"

#endif
