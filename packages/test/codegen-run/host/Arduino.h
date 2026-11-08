#ifndef _E95_HOST_ARDUINO_H
#define _E95_HOST_ARDUINO_H
// Host stand-in for the platform `Arduino.h`. The generated translation unit
// (and the real core headers it pulls in: core_time.h, core_gpio.h, ...) only
// needs the Arduino typedefs/constants plus a handful of GPIO/time entry
// points. Those are forwarded to `e95_host_*` hooks that the generated driver
// implements, so a scenario can record/assert the observable device behavior
// (pin writes) instead of talking to real hardware.
#include <avr/pgmspace.h>
#include <stddef.h>
#include <stdint.h>

typedef bool boolean;
typedef uint8_t byte;

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A4 18
#define A5 19
#define A6 20
#define A7 21

// AVR analog reference register bits, mirroring `avr/iom328p.h` (`ADMUX` at
// 0x7C, `REFS0` = 6, `REFS1` = 7). The generated `core_gpio.h` names them even
// when a scenario never selects a reference, so the host stand-in must declare
// the same surface.
#define REFS0 6
#define REFS1 7
extern volatile uint8_t ADMUX;

typedef struct __FlashStringHelper __FlashStringHelper;
#define F(string_literal) (reinterpret_cast<const __FlashStringHelper *>(string_literal))

extern "C" {
unsigned long e95_host_millis(void);
void e95_host_delay(unsigned long milliseconds);
void e95_host_pin_mode(uint8_t pin, uint8_t mode);
void e95_host_digital_write(uint8_t pin, uint8_t value);
int e95_host_digital_read(uint8_t pin);
void e95_host_analog_write(uint8_t pin, int value);
int e95_host_analog_read(uint8_t pin);
}

inline unsigned long millis(void) {
	return e95_host_millis();
}

inline unsigned long micros(void) {
	return e95_host_millis() * 1000UL;
}

inline void delay(unsigned long milliseconds) {
	e95_host_delay(milliseconds);
}

inline void delayMicroseconds(unsigned long microseconds) {
	(void)microseconds;
}

inline void yield(void) {}

inline void pinMode(uint8_t pin, uint8_t mode) {
	e95_host_pin_mode(pin, mode);
}

inline void digitalWrite(uint8_t pin, uint8_t value) {
	e95_host_digital_write(pin, value);
}

inline int digitalRead(uint8_t pin) {
	return e95_host_digital_read(pin);
}

inline void analogWrite(uint8_t pin, int value) {
	e95_host_analog_write(pin, value);
}

inline int analogRead(uint8_t pin) {
	return e95_host_analog_read(pin);
}

#endif
