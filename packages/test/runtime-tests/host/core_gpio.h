#ifndef _E95_RUNTIME_HOST_CORE_GPIO_H
#define _E95_RUNTIME_HOST_CORE_GPIO_H
// Host stand-in for the generated `core_gpio.h`. The timer header only needs
// the pin enum and the digital wrappers, so the real arduino template is
// compiled with the same substitution markers the installer fills. Define them
// here (instead of in each test) so including a *generated* header sees the
// same pin surface the installer produces.
#define _e95_replace_pinUndefs
#define _e95_replace_pinModeMembers \
	INPUT = 0, OUTPUT = 1, INPUT_PULLUP = 2,
#define _e95_replace_pinsTable  \
	typedef enum : u8 {         \
		PIN_0 = 0,              \
		PIN_1 = 1,              \
		PIN_2 = 2,              \
		PIN_3 = 3,              \
		PIN_4 = 4,              \
		PIN_5 = 5,              \
		PIN_6 = 6,              \
		PIN_7 = 7,              \
		PIN_8 = 8,              \
		PIN_9 = 9,              \
		PIN_10 = 10,            \
		PIN_11 = 11,            \
		PIN_12 = 12,            \
		PIN_13 = 13,            \
		PIN_LED_BUILTIN = 13,   \
		PIN_A0 = A0,            \
		PIN_A1 = A1,            \
		PIN_A2 = A2,            \
		PIN_A3 = A3,            \
		PIN_A4 = A4,            \
		PIN_A5 = A5,            \
		PIN_A6 = A6,            \
		PIN_A7 = A7             \
	} Pin;                      \
	static constexpr Pin LED_BUILTIN = PIN_LED_BUILTIN;
#include "../../../registry/src/strategies/arduino/gpio/gpio.h"
#undef _e95_replace_pinUndefs
#undef _e95_replace_pinModeMembers
#undef _e95_replace_pinsTable

#endif
