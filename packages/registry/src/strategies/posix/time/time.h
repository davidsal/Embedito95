#ifndef _E95_TIME_H
#define _E95_TIME_H

#include "../type/core_type.h"

namespace core_time {

void delay(u32 milliseconds);
void delayMicros(u32 microseconds);
u32 getMillis(void);
u32 getMicros(void);
boolean hasElapsed(u32 startMillis, u32 elapsedMillis);
boolean hasElapsedMicros(u32 startMicros, u32 elapsedMicros);

} // namespace core_time

#endif
