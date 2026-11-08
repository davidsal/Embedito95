#ifndef _E95_ASYNC_H
#define _E95_ASYNC_H

#include "../time/core_time.h"

namespace core_async {

inline void sleep(u32 ms) {
	core_time::delay(ms);
}

inline void sleepMicros(u32 us) {
	core_time::delayMicros(us);
}

inline void yield(void) {}

} // namespace core_async

#endif
