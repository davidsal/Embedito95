#ifndef _E95_ASYNC_H
#define _E95_ASYNC_H

#include <Arduino.h>
#include <core_type.h>

namespace core_async {

inline void sleep(u32 ms) {
	::delay(ms);
}

inline void sleepMicros(u32 us) {
	::delayMicroseconds(us);
}

inline void yield(void) {
	::yield();
}

} // namespace core_async

#endif
