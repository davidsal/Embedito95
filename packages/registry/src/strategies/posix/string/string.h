#ifndef _E95_STRING_H
#define _E95_STRING_H

#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include "core_type.h"

#define _E95_INT32_MAX_DIGITS 11
#define _E95_INT32_MAX_CHARS 12

#define _E95_FLASH_STRING_TYPE const char *
#define _E95_READ_FLASH_BYTE(ptr) (*(ptr))

// Forward declaration: `core_type.h` includes `core_array.h` and
// `core_string.h` in that order, so a full include here would close an include
// cycle before the `core_array` namespace exists. Declarations only need the
// incomplete template; the implementation includes the real definition.
namespace core_array {
template <typename T>
class Array;
} // namespace core_array

namespace core_string {

_e95_replace_common

} // namespace core_string

#endif
