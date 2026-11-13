#ifndef _E95_ARRAY_H
#define _E95_ARRAY_H

#include <new>
#include <stdlib.h>

// Memory runtime first: `core_type.h` pulls `core_string.h`, whose declarations
// need `core_mem::Ref` before `core_array` has been fully defined.
_e95_replace_memory

#include "core_type.h"

namespace core_array {

_e95_replace_common

} // namespace core_array

#endif
