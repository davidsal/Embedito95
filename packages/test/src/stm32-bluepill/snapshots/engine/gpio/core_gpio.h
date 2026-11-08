#ifndef _E95_GPIO_H
#define _E95_GPIO_H

#include "../type/core_type.h"
#include "stm32f1xx_ll_gpio.h"

namespace core_gpio {

typedef enum : u8 {
	INPUT = 0,
	OUTPUT = 1,
	INPUT_PULLUP = 2,
	INPUT_PULLDOWN = 3,
} PinMode;

typedef enum : u8 {
	LOW = 0,
	HIGH = 1
} DigitalLevel;

typedef enum : u8 {
	MSB_FIRST = 0,
	LSB_FIRST = 1
} BitOrder;

// The STM32F1 ADC samples against VDDA/VREF+ and has no reference-selection
// register. The members keep the same names and the AVR REFS1:REFS0 encoding
// on every target, so the enum is identical; the setter below is a no-op here.
typedef enum : u8 {
	EXTERNAL = 0,
	SUPPLY = 1,
	INTERNAL = 3
} VoltageReference;

typedef enum : u8 {
	PIN_A0 = 0,
	PIN_A1 = 1,
	PIN_A2 = 2,
	PIN_A3 = 3,
	PIN_A4 = 4,
	PIN_A5 = 5,
	PIN_A6 = 6,
	PIN_A7 = 7,
	PIN_A8 = 8,
	PIN_A9 = 9,
	PIN_A10 = 10,
	PIN_A11 = 11,
	PIN_A12 = 12,
	PIN_A13 = 13,
	PIN_A14 = 14,
	PIN_A15 = 15,
	PIN_B0 = 16,
	PIN_B1 = 17,
	PIN_B2 = 18,
	PIN_B3 = 19,
	PIN_B4 = 20,
	PIN_B5 = 21,
	PIN_B6 = 22,
	PIN_B7 = 23,
	PIN_B8 = 24,
	PIN_B9 = 25,
	PIN_B10 = 26,
	PIN_B11 = 27,
	PIN_B12 = 28,
	PIN_B13 = 29,
	PIN_B14 = 30,
	PIN_B15 = 31,
	PIN_C13 = 32,
	PIN_LED_BUILTIN = 33,
	PIN_C14 = 34,
	PIN_C15 = 35
} Pin;

static constexpr Pin LED_BUILTIN = PIN_LED_BUILTIN;

typedef struct {
	GPIO_TypeDef *port;
	u32 mask;
} _e95_PinInfo;

extern const _e95_PinInfo _e95_PINS[];

inline GPIO_TypeDef *_e95_pinPort(Pin pin) {
	return _e95_PINS[(u8)(pin)].port;
}

inline u32 _e95_pinMask(Pin pin) {
	return _e95_PINS[(u8)(pin)].mask;
}

void _e95_setPinAlternate(Pin pin);

void setMode(Pin pin, PinMode mode);

void writeShift(Pin dataPin, Pin clockPin, BitOrder bitOrder, u8 value);
u8 readShift(Pin dataPin, Pin clockPin, BitOrder bitOrder);

void setAnalog(Pin pin, u16 value);
i16 getAnalog(Pin pin);

inline void setDigital(Pin pin, DigitalLevel level) {
	if (level) {
		LL_GPIO_SetOutputPin(_e95_pinPort(pin), _e95_pinMask(pin));
	} else {
		LL_GPIO_ResetOutputPin(_e95_pinPort(pin), _e95_pinMask(pin));
	}
}

inline DigitalLevel getDigital(Pin pin) {
	return (DigitalLevel)LL_GPIO_IsInputPinSet(_e95_pinPort(pin), _e95_pinMask(pin));
}

// The STM32F1 ADC samples against VDDA/VREF+ with no selection register, so
// the reference setter is accepted for surface parity but leaves the hardware
// untouched. See docs/api-coverage.md.
inline void setReference(VoltageReference reference) {
	(void)reference;
}

} // namespace core_gpio

#endif
