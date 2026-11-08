#ifndef _E95_RUNTIME_HOST_CORE_TYPE_H
#define _E95_RUNTIME_HOST_CORE_TYPE_H
// Host stand-in for the platform `core_type.h`. The real generated header pulls
// the integer typedefs and per-shape types; on the host the Arduino stand-in
// already provides the typedefs, so this only forwards to it.
#include <Arduino.h>

#endif
