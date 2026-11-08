#ifndef _E95_RUNTIME_HOST_CORE_SYSTEM_H
#define _E95_RUNTIME_HOST_CORE_SYSTEM_H
// Host stand-in for the generated `core_system.h`. The library headers include
// it (e.g. lib_servo.h) for the platform typedefs; nothing from core_system is
// used on the host, so forwarding to the Arduino stand-in is enough.
#include <Arduino.h>

#endif
