#ifndef _E95_SYSTEM_H
#define _E95_SYSTEM_H

#include "core_type.h"
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

void initializeSystemClock();

namespace core_system {

u16 getFreeHeap();

}

#endif
