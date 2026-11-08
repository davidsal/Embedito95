#ifndef _E95_HOST_TYPE_H
#define _E95_HOST_TYPE_H
// Host stand-in for the platform `core_type.h`. The generated translation unit
// pulls the integer typedefs and the per-shape types from here. The Array /
// Object (and, when a program uses strings, String) runtimes are the real
// device headers (host-compilable), included by absolute path from the project
// core directory; only the typedef preamble and the `nullable` helper are
// re-declared so we do not depend on `pgmspace.h` (the host `Arduino.h` stand-in
// provides `boolean` and the GPIO/time entry points).
#include <Arduino.h>
#include <stdint.h>

using u8 = uint8_t;
using u16 = uint16_t;
using u32 = uint32_t;
using u64 = uint64_t;
using i8 = int8_t;
using i16 = int16_t;
using i32 = int32_t;
using i64 = int64_t;
using f32 = float;
using f64 = double;

template <typename T>
struct nullable {
	boolean isNull;
	T value;
};

#include <core_array.h>
#include <core_object.h>
#include <core_string.h>
#endif
