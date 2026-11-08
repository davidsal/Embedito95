#ifndef _E95_TIME_H
#define _E95_TIME_H

#include <Arduino.h>
#include <core_type.h>

namespace core_time {

inline void delay(u32 milliseconds) {
	::delay(milliseconds);
}

inline void delayMicros(u32 microseconds) {
	::delayMicroseconds(microseconds);
}

inline u32 getMillis(void) {
	return ::millis();
}

inline u32 getMicros(void) {
	return ::micros();
}

inline boolean hasElapsed(u32 startMillis, u32 elapsedMillis) {
	return (u32)(::millis() - startMillis) >= elapsedMillis;
}

inline boolean hasElapsedMicros(u32 startMicros, u32 elapsedMicros) {
	return (u32)(::micros() - startMicros) >= elapsedMicros;
}

} // namespace core_time

#endif
