#ifndef _E95_RUNTIME_HOST_UTIL_DELAY_BASIC_H
#define _E95_RUNTIME_HOST_UTIL_DELAY_BASIC_H
// Host stand-in for `util/delay_basic.h`. On the device `_delay_loop_2` burns
// four cycles per iteration; on the host it only records the delay through an
// optional hook, so a test can observe the bit sequence a driver emits without
// waiting for real time.
#include <stdint.h>

inline void (*e95HostDelayLoopHook)(uint16_t) = nullptr;

inline void _delay_loop_2(uint16_t count) {
	if (e95HostDelayLoopHook != nullptr) {
		e95HostDelayLoopHook(count);
	}
}

inline void _delay_loop_1(uint8_t count) {
	(void)count;
}

#endif
