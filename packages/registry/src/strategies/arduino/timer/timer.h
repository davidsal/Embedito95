#ifndef _E95_TIMER_H
#define _E95_TIMER_H

#include <Arduino.h>
#include <avr/io.h>
#include <avr/interrupt.h>
#include <core_gpio.h>
#include <core_time.h>
#include <core_type.h>

namespace core_timer {

_e95_replace_timerCommon

namespace timer_detail {

// The ATmega328P clock-select ladder is the same on all three counters.
const u8 AVR_PRESCALER_COUNT = 5;
const u32 AVR_PRESCALER_1 = 1;
const u32 AVR_PRESCALER_8 = 8;
const u32 AVR_PRESCALER_64 = 64;
const u32 AVR_PRESCALER_256 = 256;
const u32 AVR_PRESCALER_1024 = 1024;
const u32 AVR_PRESCALERS[AVR_PRESCALER_COUNT] = {
	AVR_PRESCALER_1,
	AVR_PRESCALER_8,
	AVR_PRESCALER_64,
	AVR_PRESCALER_256,
	AVR_PRESCALER_1024,
};
const PrescalerLadder AVR_PRESCALER_LADDER = {
	AVR_PRESCALERS,
	AVR_PRESCALER_COUNT,
};

// Maps the selected prescaler to the AVR clock-select bits.
inline u8 prescalerToControlBits(u16 prescaler) {
	switch (prescaler) {
		case AVR_PRESCALER_8: {
			return _BV(CS11);
		}
		case AVR_PRESCALER_64: {
			return (u8)(_BV(CS10) | _BV(CS11));
		}
		case AVR_PRESCALER_256: {
			return _BV(CS12);
		}
		case AVR_PRESCALER_1024: {
			return (u8)(_BV(CS10) | _BV(CS12));
		}
		default: {
			return _BV(CS10);
		}
	}
}

inline void toggleTonePin(u8 pin) {
	const core_gpio::DigitalLevel level = core_gpio::getDigital((core_gpio::Pin)pin);
	const core_gpio::DigitalLevel nextLevel =
		level == core_gpio::HIGH ? core_gpio::LOW : core_gpio::HIGH;
	core_gpio::setDigital((core_gpio::Pin)pin, nextLevel);
}

inline u32 readMicrosecondClock() {
	return core_time::getMicros();
}

inline u8 readPinLevel(u8 pin) {
	return (u8)core_gpio::getDigital((core_gpio::Pin)pin);
}

} // namespace timer_detail

class HardwareTimer {
public:
	HardwareTimer() : number_(0) {}

	explicit HardwareTimer(u8 number) : number_(number) {}

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

_e95_replace_timerSupport

// The declarations below depend on the `Timer` enum emitted by the support
// block, so they must stay after its marker.
void startTone(Timer timer, core_gpio::Pin pin, u16 frequencyHertz);
void stopTone(core_gpio::Pin pin);
u32 measurePulseWidth(core_gpio::Pin pin, core_gpio::DigitalLevel level, u32 timeoutMicros);

inline void HardwareTimer::initialize(u32 periodMicros, void (*callback)()) const {
	timer_detail::setCallback(number_, callback);
	setPeriod(periodMicros);
	stop();
}

inline void HardwareTimer::setPeriod(u32 periodMicros) const {
	timer_detail::applyPeriod(number_, periodMicros);
}

inline void HardwareTimer::start() const {
	timer_detail::startCounter(number_);
}

inline void HardwareTimer::stop() const {
	timer_detail::stopCounter(number_);
}

inline void startTone(Timer timer, core_gpio::Pin pin, u16 frequencyHertz) {
	const u8 timerNumber = (u8)timer;
	const u8 previousPin = timer_detail::findTonePin(timerNumber);

	if (previousPin != timer_detail::TONE_NONE) {
		core_gpio::setDigital((core_gpio::Pin)previousPin, core_gpio::LOW);
	}

	const u8 previousTimer = timer_detail::findToneTimer((u8)pin);

	if (previousTimer != timer_detail::TONE_NONE) {
		timer_detail::stopCounter(previousTimer);
		timer_detail::clearTonePin(previousTimer);
	}

	core_gpio::setMode(pin, core_gpio::OUTPUT);
	core_gpio::setDigital(pin, core_gpio::LOW);
	timer_detail::setTonePin(timerNumber, (u8)pin);
	timer_detail::applyPeriod(timerNumber, timer_detail::resolveToneHalfPeriodMicros(frequencyHertz));
	timer_detail::startCounter(timerNumber);
}

inline void stopTone(core_gpio::Pin pin) {
	const u8 timerNumber = timer_detail::findToneTimer((u8)pin);

	if (timerNumber == timer_detail::TONE_NONE) {
		return;
	}

	timer_detail::stopCounter(timerNumber);
	timer_detail::clearTonePin(timerNumber);
	core_gpio::setDigital(pin, core_gpio::LOW);
}

inline u32 measurePulseWidth(core_gpio::Pin pin, core_gpio::DigitalLevel level, u32 timeoutMicros) {
	core_gpio::setMode(pin, core_gpio::INPUT);
	const timer_detail::PulseWidthProbe probe = {
		(u8)pin,
		timer_detail::readMicrosecondClock,
		timer_detail::readPinLevel,
	};
	return timer_detail::measurePulseWidthFromProbe(probe, (u8)level, timeoutMicros);
}

} // namespace core_timer

#endif
