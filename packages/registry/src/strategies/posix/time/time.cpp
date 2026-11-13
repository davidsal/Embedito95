#include "core_time.h"

#include <cerrno>
#include <ctime>

namespace core_time {

namespace {

const u64 NANOS_PER_SECOND = 1000000000ULL;
const u64 NANOS_PER_MILLI = 1000000ULL;
const u64 NANOS_PER_MICRO = 1000ULL;

u64 nowNanoseconds(void) {
	struct timespec current;
	clock_gettime(CLOCK_MONOTONIC, &current);
	return (u64)current.tv_sec * NANOS_PER_SECOND + (u64)current.tv_nsec;
}

u64 timespecToNanoseconds(const struct timespec &value) {
	return (u64)value.tv_sec * NANOS_PER_SECOND + (u64)value.tv_nsec;
}

void waitNanoseconds(u64 duration) {
	u64 remaining = duration;
	while (remaining > 0) {
		struct timespec request;
		request.tv_sec = (time_t)(remaining / NANOS_PER_SECOND);
		request.tv_nsec = (long)(remaining % NANOS_PER_SECOND);

		struct timespec leftover;
		if (nanosleep(&request, &leftover) == 0) {
			return;
		}

		if (errno != EINTR) {
			return;
		}

		remaining = timespecToNanoseconds(leftover);
	}
}

} // namespace

void delayMicros(u32 microseconds) {
	waitNanoseconds((u64)microseconds * NANOS_PER_MICRO);
}

void delay(u32 milliseconds) {
	waitNanoseconds((u64)milliseconds * NANOS_PER_MILLI);
}

u32 getMicros(void) {
	return (u32)(nowNanoseconds() / NANOS_PER_MICRO);
}

u32 getMillis(void) {
	return (u32)(nowNanoseconds() / NANOS_PER_MILLI);
}

boolean hasElapsed(u32 startMillis, u32 elapsedMillis) {
	return (u32)(getMillis() - startMillis) >= elapsedMillis;
}

boolean hasElapsedMicros(u32 startMicros, u32 elapsedMicros) {
	return (u32)(getMicros() - startMicros) >= elapsedMicros;
}

} // namespace core_time
