#ifndef _E95_RUNTIME_HOST_CORE_TIME_H
#define _E95_RUNTIME_HOST_CORE_TIME_H
// Host stand-in for `core_time.h`. The serial engine reads its timeout through
// `core_time::getMillis`, so the stub models a clock that advances a fixed step
// on every read: a positive timeout then terminates in a bounded number of
// polls instead of spinning forever. Tests that need to measure how long a read
// waited call `resetHostClockMillis` / `peekHostClockMillis`.
#include <stdint.h>

namespace core_time {

const uint32_t HOST_CLOCK_STEP_MILLIS = 100;

inline uint32_t &hostClockMillis() {
	static uint32_t millis = 0;
	return millis;
}

inline uint32_t getMillis() {
	hostClockMillis() += HOST_CLOCK_STEP_MILLIS;
	return hostClockMillis();
}

inline void resetHostClockMillis() {
	hostClockMillis() = 0;
}

inline uint32_t peekHostClockMillis() {
	return hostClockMillis();
}

inline void delay(uint32_t milliseconds) {
	hostClockMillis() += milliseconds;
}

uint32_t getMicros();

} // namespace core_time

#endif
