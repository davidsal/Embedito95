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
