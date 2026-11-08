#ifndef _E95_TIMER_H
#define _E95_TIMER_H

#include <Arduino.h>
#include <avr/io.h>
#include <avr/interrupt.h>
#include <core_gpio.h>
#include <core_time.h>
#include <core_type.h>

namespace core_timer {

// Shared timer helpers, platform-agnostic.
// Single source of truth for the period/prescaler arithmetic, inlined into each
// platform's timer implementation through the `_e95_replace_timerCommon`
// marker. It is self-contained (only `<stdint.h>` types) so the host can
// compile and exercise it directly in runtime-tests/timer-prescaler.test.cpp.
//
// The compare period is expressed as a tick count: a timer reloads every
// `ticks` input-clock cycles, so the hardware compare register receives
// `ticks - 1`. Keeping the count (instead of the register value) lets a full
// 16-bit timer reach 65536 cycles without overflowing the register width.

namespace timer_detail {

const uint32_t MICROSECONDS_PER_SECOND = 1000000;
const uint32_t MINIMUM_PERIOD_MICROS = 1;
const uint32_t MINIMUM_TICKS = 1;

const uint32_t MAXIMUM_TICKS_8_BIT = 256;
const uint32_t MAXIMUM_TICKS_16_BIT = 65536;

const uint8_t TONE_NONE = 0xFF;
const uint16_t MINIMUM_TONE_FREQUENCY_HERTZ = 1;
const uint32_t MICROSECONDS_PER_HALF_CYCLE = MICROSECONDS_PER_SECOND / 2;

// The candidate prescalers are supplied by each platform, in ascending order:
// their values and count differ between counters and families.
struct PrescalerLadder {
	const uint32_t *values;
	uint8_t count;
};

struct PrescalerConfig {
	uint16_t prescaler;
	uint32_t ticks;
};

inline uint64_t resolveTicks(uint32_t periodMicros, uint32_t clockFrequency, uint32_t prescaler) {
	const uint64_t clockCycles =
		(uint64_t)periodMicros * (uint64_t)clockFrequency;
	const uint64_t prescaledCycles =
		(uint64_t)prescaler * (uint64_t)MICROSECONDS_PER_SECOND;
	return clockCycles / prescaledCycles;
}

inline PrescalerConfig makePrescalerConfig(uint32_t prescaler, uint32_t ticks) {
	PrescalerConfig config;
	config.prescaler = (uint16_t)prescaler;
	config.ticks = ticks;
	return config;
}

// Picks the smallest prescaler whose tick count still fits the counter, so the
// period keeps the best resolution the hardware can offer. Periods longer than
// the counter can hold at the highest prescaler are clamped to its maximum.
inline PrescalerConfig computePrescaler(uint32_t periodMicros, uint32_t clockFrequency, uint32_t maximumTicks, PrescalerLadder ladder) {
	const uint32_t effectivePeriodMicros =
		periodMicros < MINIMUM_PERIOD_MICROS ? MINIMUM_PERIOD_MICROS : periodMicros;

	for (uint8_t index = 0; index < ladder.count; index++) {
		const uint32_t prescaler = ladder.values[index];
		const uint64_t ticks = resolveTicks(effectivePeriodMicros, clockFrequency, prescaler);
		if (ticks >= MINIMUM_TICKS && ticks <= maximumTicks) {
			return makePrescalerConfig(prescaler, (uint32_t)ticks);
		}
	}

	const uint32_t highestPrescaler = ladder.values[ladder.count - 1];
	const uint64_t ticks = resolveTicks(effectivePeriodMicros, clockFrequency, highestPrescaler);
	const uint32_t clampedTicks =
		ticks < MINIMUM_TICKS ? MINIMUM_TICKS : (ticks > maximumTicks ? maximumTicks : (uint32_t)ticks);
	return makePrescalerConfig(highestPrescaler, clampedTicks);
}

// A tone alternates the pin every half cycle, so the compare period is half of
// the requested wave period. Frequencies the counters cannot represent are
// clamped by the same prescaler ladder used for plain periods.
inline uint32_t resolveToneHalfPeriodMicros(uint16_t frequencyHertz) {
	const uint32_t effectiveFrequency =
		frequencyHertz < MINIMUM_TONE_FREQUENCY_HERTZ ? MINIMUM_TONE_FREQUENCY_HERTZ : frequencyHertz;
	const uint32_t halfPeriodMicros = MICROSECONDS_PER_HALF_CYCLE / effectiveFrequency;
	return halfPeriodMicros < MINIMUM_PERIOD_MICROS ? MINIMUM_PERIOD_MICROS : halfPeriodMicros;
}

// The pulse measurement loop is shared; each platform supplies the microsecond
// clock and the pin-level reader, which differ in their type wrappers.
struct PulseWidthProbe {
	uint8_t pin;
	uint32_t (*getMicros)();
	uint8_t (*getLevel)(uint8_t pin);
};

inline bool isPulseTimedOut(PulseWidthProbe probe, uint32_t startMicros, uint32_t timeoutMicros) {
	return (uint32_t)(probe.getMicros() - startMicros) >= timeoutMicros;
}

inline uint32_t measurePulseWidthFromProbe(PulseWidthProbe probe, uint8_t level, uint32_t timeoutMicros) {
	const uint32_t startMicros = probe.getMicros();

	while (probe.getLevel(probe.pin) == level) {
		if (isPulseTimedOut(probe, startMicros, timeoutMicros)) {
			return 0;
		}
	}

	while (probe.getLevel(probe.pin) != level) {
		if (isPulseTimedOut(probe, startMicros, timeoutMicros)) {
			return 0;
		}
	}

	const uint32_t pulseStartMicros = probe.getMicros();

	while (probe.getLevel(probe.pin) == level) {
		if (isPulseTimedOut(probe, pulseStartMicros, timeoutMicros)) {
			return 0;
		}
	}

	return probe.getMicros() - pulseStartMicros;
}

} // namespace timer_detail

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

typedef enum : u8 {
	TIMER_1 = 1,
	TIMER_2 = 2
} Timer;

namespace timer_detail {
static void (*timer1Callback)() = nullptr;
static void (*timer2Callback)() = nullptr;
static u8 timer1TonePin = TONE_NONE;
static u8 timer2TonePin = TONE_NONE;

inline void setTonePin(u8 number, u8 pin) {
	switch (number) {
		case Timer::TIMER_1: {
			timer1TonePin = pin;
			break;
		}
		case Timer::TIMER_2: {
			timer2TonePin = pin;
			break;
		}
		default: {
			break;
		}
	}
}

inline void clearTonePin(u8 number) {
	switch (number) {
		case Timer::TIMER_1: {
			timer1TonePin = TONE_NONE;
			break;
		}
		case Timer::TIMER_2: {
			timer2TonePin = TONE_NONE;
			break;
		}
		default: {
			break;
		}
	}
}

inline u8 findToneTimer(u8 pin) {
	if (timer1TonePin == pin) {
		return (u8)Timer::TIMER_1;
	}
	if (timer2TonePin == pin) {
		return (u8)Timer::TIMER_2;
	}
	return TONE_NONE;
}

inline u8 findTonePin(u8 number) {
	switch (number) {
		case Timer::TIMER_1: {
			return timer1TonePin;
		}
		case Timer::TIMER_2: {
			return timer2TonePin;
		}
		default: {
			return TONE_NONE;
		}
	}
}

inline void applyTimer1Period(u32 periodMicros) {
	const PrescalerConfig config = computePrescaler(periodMicros, F_CPU, MAXIMUM_TICKS_16_BIT, AVR_PRESCALER_LADDER);
	TCCR1A = 0;
	TCCR1B = (u8)(_BV(WGM12) | prescalerToControlBits(config.prescaler));
	TCNT1 = 0;
	OCR1A = (u16)(config.ticks - 1);
}

inline void applyTimer2Period(u32 periodMicros) {
	const PrescalerConfig config = computePrescaler(periodMicros, F_CPU, MAXIMUM_TICKS_8_BIT, AVR_PRESCALER_LADDER);
	TCCR2A = (u8)_BV(WGM21);
	TCCR2B = (u8)prescalerToControlBits(config.prescaler);
	TCNT2 = 0;
	OCR2A = (u8)(config.ticks - 1);
}

inline void setCallback(u8 number, void (*callback)()) {
	switch (number) {
		case Timer::TIMER_1: {
			timer1Callback = callback;
			break;
		}
		case Timer::TIMER_2: {
			timer2Callback = callback;
			break;
		}
		default: {
			break;
		}
	}
}

inline void applyPeriod(u8 number, u32 periodMicros) {
	switch (number) {
		case Timer::TIMER_1: {
			applyTimer1Period(periodMicros);
			break;
		}
		case Timer::TIMER_2: {
			applyTimer2Period(periodMicros);
			break;
		}
		default: {
			break;
		}
	}
}

inline void startCounter(u8 number) {
	switch (number) {
		case Timer::TIMER_1: {
			TIMSK1 |= (u8)_BV(OCIE1A);
			TIFR1 = (u8)_BV(OCF1A);
			break;
		}
		case Timer::TIMER_2: {
			TIMSK2 |= (u8)_BV(OCIE2A);
			TIFR2 = (u8)_BV(OCF2A);
			break;
		}
		default: {
			break;
		}
	}
}

inline void stopCounter(u8 number) {
	switch (number) {
		case Timer::TIMER_1: {
			TIMSK1 &= (u8)~_BV(OCIE1A);
			break;
		}
		case Timer::TIMER_2: {
			TIMSK2 &= (u8)~_BV(OCIE2A);
			break;
		}
		default: {
			break;
		}
	}
}

inline void runTimer1Callback() {
	if (timer1TonePin != TONE_NONE) {
		toggleTonePin(timer1TonePin);
	} else if (timer1Callback != nullptr) {
		timer1Callback();
	}
}

inline void runTimer2Callback() {
	if (timer2TonePin != TONE_NONE) {
		toggleTonePin(timer2TonePin);
	} else if (timer2Callback != nullptr) {
		timer2Callback();
	}
}
} // namespace timer_detail
} // namespace core_timer

ISR(TIMER1_COMPA_vect) {
	core_timer::timer_detail::runTimer1Callback();
}

ISR(TIMER2_COMPA_vect) {
	core_timer::timer_detail::runTimer2Callback();
}

namespace core_timer {

inline HardwareTimer getTimer(Timer selector) {
	switch (selector) {
		case Timer::TIMER_1: {
			return HardwareTimer((u8)Timer::TIMER_1);
		}
		case Timer::TIMER_2: {
			return HardwareTimer((u8)Timer::TIMER_2);
		}
		default: {
			return HardwareTimer();
		}
	}
}

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
