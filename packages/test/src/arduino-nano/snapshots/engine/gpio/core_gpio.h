#ifndef _E95_GPIO_H
#define _E95_GPIO_H

#include <Arduino.h>
#include <core_type.h>

#undef INPUT
#undef OUTPUT
#undef INPUT_PULLUP
#undef LOW
#undef HIGH
#undef LED_BUILTIN
#undef EXTERNAL
#undef INTERNAL

#undef PIN_A0
#undef PIN_A1
#undef PIN_A2
#undef PIN_A3
#undef PIN_A4
#undef PIN_A5
#undef PIN_A6
#undef PIN_A7

namespace core_gpio {

typedef enum : u8 {
	INPUT = 0,
	OUTPUT = 1,
	INPUT_PULLUP = 2,
} PinMode;

typedef enum : u8 {
	LOW = 0,
	HIGH = 1
} DigitalLevel;

typedef enum : u8 {
	MSB_FIRST = 0,
	LSB_FIRST = 1
} BitOrder;

// The AVR REFS1:REFS0 pair selects the ADC voltage reference; the encoded
// values are the raw register bits the platform expects.
typedef enum : u8 {
	EXTERNAL = 0,
	SUPPLY = 1,
	INTERNAL = 3
} VoltageReference;

inline constexpr u8 _e95_SHIFT_BIT_COUNT = 8;
inline constexpr u8 _e95_REFERENCE_BIT_MASK = (u8)((1 << REFS0) | (1 << REFS1));

typedef enum : u8 {
	PIN_0 = 0,
	PIN_1 = 1,
	PIN_2 = 2,
	PIN_3 = 3,
	PIN_4 = 4,
	PIN_5 = 5,
	PIN_6 = 6,
	PIN_7 = 7,
	PIN_8 = 8,
	PIN_9 = 9,
	PIN_10 = 10,
	PIN_11 = 11,
	PIN_12 = 12,
	PIN_13 = 13,
	PIN_LED_BUILTIN = 13,
	PIN_A0 = A0,
	PIN_A1 = A1,
	PIN_A2 = A2,
	PIN_A3 = A3,
	PIN_A4 = A4,
	PIN_A5 = A5,
	PIN_A6 = A6,
	PIN_A7 = A7
} Pin;

static constexpr Pin LED_BUILTIN = PIN_LED_BUILTIN;

inline void setMode(Pin pin, PinMode mode) {
	pinMode((u8)(pin), (u8)(mode));
}

inline void setDigital(Pin pin, DigitalLevel level) {
	digitalWrite((u8)(pin), (u8)(level));
}

inline DigitalLevel getDigital(Pin pin) {
	return (DigitalLevel)digitalRead((u8)(pin));
}

inline void writeShift(Pin dataPin, Pin clockPin, BitOrder bitOrder, u8 value) {
	setMode(dataPin, OUTPUT);
	setMode(clockPin, OUTPUT);
	for (u8 bit = 0; bit < _e95_SHIFT_BIT_COUNT; bit++) {
		const u8 bitIndex = (bitOrder == MSB_FIRST)
			? (u8)(_e95_SHIFT_BIT_COUNT - 1 - bit)
			: bit;
		digitalWrite((u8)(dataPin), (u8)((value >> bitIndex) & 1));
		digitalWrite((u8)(clockPin), (u8)HIGH);
		digitalWrite((u8)(clockPin), (u8)LOW);
	}
}

inline u8 readShift(Pin dataPin, Pin clockPin, BitOrder bitOrder) {
	setMode(clockPin, OUTPUT);
	setMode(dataPin, INPUT);
	u8 value = 0;
	for (u8 bit = 0; bit < _e95_SHIFT_BIT_COUNT; bit++) {
		digitalWrite((u8)(clockPin), (u8)HIGH);
		const u8 bitIndex = (bitOrder == MSB_FIRST)
			? (u8)(_e95_SHIFT_BIT_COUNT - 1 - bit)
			: bit;
		value |= (u8)(digitalRead((u8)(dataPin)) & 1) << bitIndex;
		digitalWrite((u8)(clockPin), (u8)LOW);
	}
	return value;
}

inline void setAnalog(Pin pin, u16 value) {
	analogWrite((u8)(pin), value);
}

inline i16 getAnalog(Pin pin) {
	return (i16)analogRead((u8)(pin));
}

inline void setReference(VoltageReference reference) {
	ADMUX = (u8)((ADMUX & (u8)~_e95_REFERENCE_BIT_MASK) |
		(((u8)reference << REFS0) & _e95_REFERENCE_BIT_MASK));
}

} // namespace core_gpio

#endif
