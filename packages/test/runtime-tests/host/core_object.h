#ifndef _E95_RUNTIME_HOST_CORE_OBJECT_H
#define _E95_RUNTIME_HOST_CORE_OBJECT_H
// Host stand-in for the generated `core_object.h`. The shared-mutable object
// handle is host-compilable through the standalone object_ref.h, so a runtime
// test that includes a *generated* library header sees the exact same
// core_object::Object<Fields> template the device compiles.
#include "packages/registry/src/strategies/shared/object/object_ref.h"

#endif
