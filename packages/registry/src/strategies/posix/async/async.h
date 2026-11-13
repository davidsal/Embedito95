#ifndef _E95_ASYNC_H
#define _E95_ASYNC_H

#include "../time/core_time.h"

namespace core_async {

inline void sleep(u32 milliseconds) {
	core_time::delay(milliseconds);
}

inline void sleepMicros(u32 microseconds) {
	core_time::delayMicros(microseconds);
}

inline void yield(void) {}

} // namespace core_async

#endif
