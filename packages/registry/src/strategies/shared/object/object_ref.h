// Host-facing standalone header for the shared-mutable object handle backed by
// the core_mem::Ref refcount motor.
//
// The Object<Fields> template's single source of truth lives in object.common.h
// (the production body, inlined into each platform's core_object.h via
// _e95_replace_common). This file exists so runtime-tests/object-ref.test.cpp
// can compile that same body on the host without the platform wrappers: it pulls
// in the memory motor by its repo-relative path and re-opens core_object.
//
// Semantics (TS-like, shared-mutable, NOT copy-on-write — like Array, NOT like
// String):
//   - assignment `let b = a`        -> b aliases a's storage (refs+1). No field
//                                      copy. Mutating a field through b is
//                                      visible through a, and vice-versa.
//   - passing `f(obj)`              -> a copy of the handle crosses the call
//                                      boundary (refs+1). Mutating fields inside
//                                      f reaches the caller (alias).
//   - reassigning the param / a var -> rebinds only the LOCAL handle; the
//                                      caller's object is untouched.
//   - move                          -> steals the storage; moved-from is empty.
//   - dtor                          -> release; when refs hits 0 the storage
//                                      (and every nested handle it holds) is
//                                      freed.
//
// Reference fields stored as handles give TS identity/aliasing for nested
// objects and let objects be passed without copying field contents. A field
// that aliases an ancestor (`obj.child = obj`) forms a reference cycle: with
// cycles enabled the trial-deletion collector reclaims it (see
// ../memory/ref.h), while `cycles: "off"` leaks it under the plain refcount.

#ifndef _E95_OBJECT_REF_H
#define _E95_OBJECT_REF_H

#include "../memory/ref.h"

#include <new>
#include <stdint.h>
#include <stdlib.h>

namespace core_object {

#include "object.common.h"

} // namespace core_object

#endif // _E95_OBJECT_REF_H
