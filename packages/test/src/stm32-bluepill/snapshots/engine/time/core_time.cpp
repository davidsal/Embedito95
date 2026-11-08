#include "stm32f1xx_ll_utils.h"
#include "core_time.h"

namespace core_time {

static const u32 MAX_DELAY_MS_CHUNK = 29000;
static const u32 MAX_DELAY_MICROS_CHUNK = 29000000;

static const u32 CYCLES_PER_MS = 72000000 / 1000UL;
static const u32 CYCLES_PER_US = 72000000 / 1000000UL;

static u32 _e95_nowCycles(void) {
	CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
	DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
	return DWT->CYCCNT;
}

void delayMicros(u32 microseconds) {
	while (microseconds > 0) {
		const u32 chunk =
			microseconds > MAX_DELAY_MICROS_CHUNK ? MAX_DELAY_MICROS_CHUNK : microseconds;
		const u32 cycles = chunk * CYCLES_PER_US;
		const u32 start = _e95_nowCycles();

		while ((u32)(DWT->CYCCNT - start) < cycles) {
		}

		microseconds -= chunk;
	}
}

void delay(u32 milliseconds) {
	while (milliseconds > 0) {
		const u32 chunk =
			milliseconds > MAX_DELAY_MS_CHUNK ? MAX_DELAY_MS_CHUNK : milliseconds;
		const u32 cycles = chunk * CYCLES_PER_MS;
		const u32 start = _e95_nowCycles();

		while ((u32)(DWT->CYCCNT - start) < cycles) {
		}

		milliseconds -= chunk;
	}
}

u32 getMicros(void) {
	return _e95_nowCycles() / CYCLES_PER_US;
}

u32 getMillis(void) {
	return _e95_nowCycles() / CYCLES_PER_MS;
}

boolean hasElapsed(u32 startMillis, u32 elapsedMillis) {
	return (u32)(getMillis() - startMillis) >= elapsedMillis;
}

boolean hasElapsedMicros(u32 startMicros, u32 elapsedMicros) {
	return (u32)(getMicros() - startMicros) >= elapsedMicros;
}

} // namespace core_time
