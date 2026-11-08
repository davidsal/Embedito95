#ifndef _E95_GPIO_H
#define _E95_GPIO_H

#include "../type/core_type.h"
#include "stm32f1xx_ll_gpio.h"

namespace core_gpio {

typedef enum : u8 {
_e95_replace_pinModeMembers
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

_e95_replace_pinEnum

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
