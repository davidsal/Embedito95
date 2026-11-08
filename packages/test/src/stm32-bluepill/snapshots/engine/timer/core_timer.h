#ifndef _E95_TIMER_H
#define _E95_TIMER_H

#include "../gpio/core_gpio.h"
#include "../type/core_type.h"

namespace core_timer {

typedef enum : u8 {
	TIMER_1 = 1,
	TIMER_2 = 2,
	TIMER_3 = 3,
	TIMER_4 = 4
} Timer;

class HardwareTimer {
public:
	HardwareTimer();
	explicit HardwareTimer(u8 number);

	void initialize(u32 periodMicros, void (*callback)()) const;
	void setPeriod(u32 periodMicros) const;
	void start() const;
	void stop() const;

	inline bool operator==(const HardwareTimer &other) const {
		return number_ == other.number_;
	}

	inline bool operator!=(const HardwareTimer &other) const {
		return !(*this == other);
	}

private:
	u8 number_;
};

HardwareTimer getTimer(Timer selector);

void startTone(Timer timer, core_gpio::Pin pin, u16 frequencyHertz);
void stopTone(core_gpio::Pin pin);
u32 measurePulseWidth(core_gpio::Pin pin, core_gpio::DigitalLevel level, u32 timeoutMicros);

} // namespace core_timer

#endif
