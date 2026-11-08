#ifndef _E95_RUNTIME_HOST_ARDUINO_H
#define _E95_RUNTIME_HOST_ARDUINO_H
// Host stand-in for the platform `Arduino.h`, used by runtime-tests that need
// to compile a real generated core header on the host. It mirrors the
// ArduinoCore-avr surface on purpose: `Print` exposes the numeric overloads the
// AVR core actually has (char, unsigned char, int, unsigned int, long,
// unsigned long, double) and deliberately NOT the 64-bit ones, so a regression
// that hands a u64/i64 straight to `print` fails to compile here.
#include <stddef.h>
#include <stdint.h>

typedef bool boolean;
typedef uint8_t byte;

typedef struct __FlashStringHelper __FlashStringHelper;
#define F(string_literal) \
	(reinterpret_cast<const __FlashStringHelper *>(string_literal))

using u8 = uint8_t;
using u16 = uint16_t;
using u32 = uint32_t;
using u64 = uint64_t;
using i8 = int8_t;
using i16 = int16_t;
using i32 = int32_t;
using i64 = int64_t;
using f32 = float;
using f64 = double;

class Print {
public:
	size_t print(const char *) { return 0; }
	size_t print(const __FlashStringHelper *) { return 0; }
	size_t print(char) { return 0; }
	size_t print(unsigned char, int = 10) { return 0; }
	size_t print(int, int = 10) { return 0; }
	size_t print(unsigned int, int = 10) { return 0; }
	size_t print(long, int = 10) { return 0; }
	size_t print(unsigned long, int = 10) { return 0; }
	size_t print(double, int = 2) { return 0; }

	size_t println(const char *) { return 0; }
	size_t println(const __FlashStringHelper *) { return 0; }
	size_t println(char) { return 0; }
	size_t println(unsigned char, int = 10) { return 0; }
	size_t println(int, int = 10) { return 0; }
	size_t println(unsigned int, int = 10) { return 0; }
	size_t println(long, int = 10) { return 0; }
	size_t println(unsigned long, int = 10) { return 0; }
	size_t println(double, int = 2) { return 0; }
};

static const int HOST_SERIAL_BUFFER_CAPACITY = 64;

class HardwareSerial : public Print {
public:
	void begin(unsigned long) {}
	void end() {}
	void flush() {}

	void feed(uint8_t value) {
		if (inboundLength_ < HOST_SERIAL_BUFFER_CAPACITY) {
			inbound_[inboundLength_] = value;
			inboundLength_++;
		}
	}

	void resetBuffers() {
		inboundLength_ = 0;
		inboundIndex_ = 0;
		writtenLength_ = 0;
	}

	int available() { return inboundLength_ - inboundIndex_; }

	int read() {
		if (inboundIndex_ >= inboundLength_) {
			return -1;
		}
		const int value = inbound_[inboundIndex_];
		inboundIndex_++;
		return value;
	}

	int availableForWrite() {
		return HOST_SERIAL_BUFFER_CAPACITY - writtenLength_;
	}

	size_t write(uint8_t value) {
		if (writtenLength_ < HOST_SERIAL_BUFFER_CAPACITY) {
			written_[writtenLength_] = value;
			writtenLength_++;
		}
		return 1;
	}

	int writtenLength() const { return writtenLength_; }

	int writtenByteAt(int index) const { return written_[index]; }

private:
	uint8_t inbound_[HOST_SERIAL_BUFFER_CAPACITY] = {};
	int inboundLength_ = 0;
	int inboundIndex_ = 0;
	uint8_t written_[HOST_SERIAL_BUFFER_CAPACITY] = {};
	int writtenLength_ = 0;
};

// Analog/digital surface of the AVR Arduino core. The prototypes mirror
// `ArduinoCore-avr/cores/arduino/Arduino.h` (lines 134-139) and the analog
// channel constants mirror `variants/standard/pins_arduino.h` (`A0` = 14 ...
// `A7` = 21). `ADMUX`/`REFS0`/`REFS1` mirror `avr/iom328p.h` (`ADMUX` at
// 0x7C, `REFS0` = 6, `REFS1` = 7): on the host the memory-mapped register
// becomes a volatile variable that keeps the same name, width and bit layout.
void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t val);
int digitalRead(uint8_t pin);
int analogRead(uint8_t pin);
void analogWrite(uint8_t pin, int val);

#define REFS0 6
#define REFS1 7
extern volatile uint8_t ADMUX;

static const uint8_t A0 = 14;
static const uint8_t A1 = 15;
static const uint8_t A2 = 16;
static const uint8_t A3 = 17;
static const uint8_t A4 = 18;
static const uint8_t A5 = 19;
static const uint8_t A6 = 20;
static const uint8_t A7 = 21;

#endif
