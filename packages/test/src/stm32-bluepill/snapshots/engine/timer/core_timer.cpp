#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_tim.h"
#include "../time/core_time.h"
#include "core_timer.h"

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

const u8 TIMER_INDEX_NONE = 0xFF;
const u8 TIMER_DEFINITION_COUNT = 4;

typedef struct {
	u8 number;
	TIM_TypeDef *timer;
	u32 clock;
	bool apb2;
	u32 clockEnable;
	IRQn_Type interrupt;
} TimerDefinition;

static const TimerDefinition TIMER_DEFINITIONS[TIMER_DEFINITION_COUNT] = {
	{ 1, TIM1, 72000000, true, LL_APB2_GRP1_PERIPH_TIM1, TIM1_UP_IRQn },
	{ 2, TIM2, 72000000, false, LL_APB1_GRP1_PERIPH_TIM2, TIM2_IRQn },
	{ 3, TIM3, 72000000, false, LL_APB1_GRP1_PERIPH_TIM3, TIM3_IRQn },
	{ 4, TIM4, 72000000, false, LL_APB1_GRP1_PERIPH_TIM4, TIM4_IRQn },
};

static void (*callbacks[TIMER_DEFINITION_COUNT])() = {
	nullptr,
	nullptr,
	nullptr,
	nullptr,
};

static u8 tonePins[TIMER_DEFINITION_COUNT] = {
	TONE_NONE,
	TONE_NONE,
	TONE_NONE,
	TONE_NONE,
};

const u32 STM32_PRESCALER_COUNT = 16;
const u32 STM32_PRESCALER_1 = 1;
const u32 STM32_PRESCALER_2 = 2;
const u32 STM32_PRESCALER_4 = 4;
const u32 STM32_PRESCALER_8 = 8;
const u32 STM32_PRESCALER_16 = 16;
const u32 STM32_PRESCALER_32 = 32;
const u32 STM32_PRESCALER_64 = 64;
const u32 STM32_PRESCALER_128 = 128;
const u32 STM32_PRESCALER_256 = 256;
const u32 STM32_PRESCALER_512 = 512;
const u32 STM32_PRESCALER_1024 = 1024;
const u32 STM32_PRESCALER_2048 = 2048;
const u32 STM32_PRESCALER_4096 = 4096;
const u32 STM32_PRESCALER_8192 = 8192;
const u32 STM32_PRESCALER_16384 = 16384;
const u32 STM32_PRESCALER_32768 = 32768;
const u32 STM32_PRESCALERS[STM32_PRESCALER_COUNT] = {
	STM32_PRESCALER_1,
	STM32_PRESCALER_2,
	STM32_PRESCALER_4,
	STM32_PRESCALER_8,
	STM32_PRESCALER_16,
	STM32_PRESCALER_32,
	STM32_PRESCALER_64,
	STM32_PRESCALER_128,
	STM32_PRESCALER_256,
	STM32_PRESCALER_512,
	STM32_PRESCALER_1024,
	STM32_PRESCALER_2048,
	STM32_PRESCALER_4096,
	STM32_PRESCALER_8192,
	STM32_PRESCALER_16384,
	STM32_PRESCALER_32768,
};
const PrescalerLadder STM32_PRESCALER_LADDER = {
	STM32_PRESCALERS,
	STM32_PRESCALER_COUNT,
};

static u8 enabledTimers = 0;

inline u8 findTimerIndex(u8 number) {
	for (u8 index = 0; index < TIMER_DEFINITION_COUNT; index++) {
		if (TIMER_DEFINITIONS[index].number == number) {
			return index;
		}
	}
	return TIMER_INDEX_NONE;
}

inline void enableTimerClock(const TimerDefinition &definition, u8 index) {
	if (enabledTimers & (u8)(1u << index)) {
		return;
	}

	if (definition.apb2) {
		LL_APB2_GRP1_EnableClock(definition.clockEnable);
	} else {
		LL_APB1_GRP1_EnableClock(definition.clockEnable);
	}
	enabledTimers |= (u8)(1u << index);
}

inline void applyTimerPeriod(const TimerDefinition &definition, u32 periodMicros) {
	const PrescalerConfig config = computePrescaler(
		periodMicros,
		definition.clock,
		MAXIMUM_TICKS_16_BIT,
		STM32_PRESCALER_LADDER);

	LL_TIM_DisableCounter(definition.timer);
	LL_TIM_SetCounterMode(definition.timer, LL_TIM_COUNTERMODE_UP);
	LL_TIM_SetPrescaler(definition.timer, config.prescaler - 1);
	LL_TIM_SetAutoReload(definition.timer, config.ticks - 1);
	LL_TIM_SetCounter(definition.timer, 0);
	LL_TIM_GenerateEvent_UPDATE(definition.timer);
	LL_TIM_ClearFlag_UPDATE(definition.timer);
	LL_TIM_EnableCounter(definition.timer);
}

inline void setCallback(u8 number, void (*callback)()) {
	const u8 index = findTimerIndex(number);

	if (index != TIMER_INDEX_NONE) {
		callbacks[index] = callback;
	}
}

inline void applyPeriod(u8 number, u32 periodMicros) {
	const u8 index = findTimerIndex(number);

	if (index == TIMER_INDEX_NONE) {
		return;
	}

	enableTimerClock(TIMER_DEFINITIONS[index], index);
	applyTimerPeriod(TIMER_DEFINITIONS[index], periodMicros);
}

inline void startCounter(u8 number) {
	const u8 index = findTimerIndex(number);

	if (index == TIMER_INDEX_NONE) {
		return;
	}

	LL_TIM_ClearFlag_UPDATE(TIMER_DEFINITIONS[index].timer);
	NVIC_EnableIRQ(TIMER_DEFINITIONS[index].interrupt);
	LL_TIM_EnableIT_UPDATE(TIMER_DEFINITIONS[index].timer);
}

inline void stopCounter(u8 number) {
	const u8 index = findTimerIndex(number);

	if (index != TIMER_INDEX_NONE) {
		LL_TIM_DisableIT_UPDATE(TIMER_DEFINITIONS[index].timer);
	}
}

inline void setTonePin(u8 number, u8 pin) {
	const u8 index = findTimerIndex(number);

	if (index != TIMER_INDEX_NONE) {
		tonePins[index] = pin;
	}
}

inline void clearTonePin(u8 number) {
	const u8 index = findTimerIndex(number);

	if (index != TIMER_INDEX_NONE) {
		tonePins[index] = TONE_NONE;
	}
}

inline u8 findToneTimer(u8 pin) {
	for (u8 index = 0; index < TIMER_DEFINITION_COUNT; index++) {
		if (tonePins[index] == pin) {
			return TIMER_DEFINITIONS[index].number;
		}
	}
	return TONE_NONE;
}

inline u8 findTonePin(u8 number) {
	const u8 index = findTimerIndex(number);

	return index == TIMER_INDEX_NONE ? TONE_NONE : tonePins[index];
}

inline void toggleTonePin(u8 pin) {
	const core_gpio::DigitalLevel level = core_gpio::getDigital((core_gpio::Pin)pin);
	const core_gpio::DigitalLevel nextLevel =
		level == core_gpio::HIGH ? core_gpio::LOW : core_gpio::HIGH;
	core_gpio::setDigital((core_gpio::Pin)pin, nextLevel);
}

inline void runTimerCallback(u8 number) {
	const u8 index = findTimerIndex(number);

	if (index == TIMER_INDEX_NONE) {
		return;
	}

	if (tonePins[index] != TONE_NONE) {
		toggleTonePin(tonePins[index]);
	} else if (callbacks[index] != nullptr) {
		callbacks[index]();
	}
}

inline u32 readMicrosecondClock() {
	return core_time::getMicros();
}

inline u8 readPinLevel(u8 pin) {
	return (u8)core_gpio::getDigital((core_gpio::Pin)pin);
}

} // namespace timer_detail

extern "C" void TIM1_UP_IRQHandler(void) {
	if (LL_TIM_IsActiveFlag_UPDATE(TIM1)) {
		LL_TIM_ClearFlag_UPDATE(TIM1);
		core_timer::timer_detail::runTimerCallback(1);
	}
}

extern "C" void TIM2_IRQHandler(void) {
	if (LL_TIM_IsActiveFlag_UPDATE(TIM2)) {
		LL_TIM_ClearFlag_UPDATE(TIM2);
		core_timer::timer_detail::runTimerCallback(2);
	}
}

extern "C" void TIM3_IRQHandler(void) {
	if (LL_TIM_IsActiveFlag_UPDATE(TIM3)) {
		LL_TIM_ClearFlag_UPDATE(TIM3);
		core_timer::timer_detail::runTimerCallback(3);
	}
}

extern "C" void TIM4_IRQHandler(void) {
	if (LL_TIM_IsActiveFlag_UPDATE(TIM4)) {
		LL_TIM_ClearFlag_UPDATE(TIM4);
		core_timer::timer_detail::runTimerCallback(4);
	}
}

HardwareTimer::HardwareTimer() : number_(0) {}

HardwareTimer::HardwareTimer(u8 number) : number_(number) {}

void HardwareTimer::initialize(u32 periodMicros, void (*callback)()) const {
	timer_detail::setCallback(number_, callback);
	setPeriod(periodMicros);
	stop();
}

void HardwareTimer::setPeriod(u32 periodMicros) const {
	timer_detail::applyPeriod(number_, periodMicros);
}

void HardwareTimer::start() const {
	timer_detail::startCounter(number_);
}

void HardwareTimer::stop() const {
	timer_detail::stopCounter(number_);
}

void startTone(Timer timer, core_gpio::Pin pin, u16 frequencyHertz) {
	const u8 number = (u8)timer;

	if (timer_detail::findTimerIndex(number) == timer_detail::TIMER_INDEX_NONE) {
		return;
	}

	const u8 previousPin = timer_detail::findTonePin(number);

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
	timer_detail::setTonePin(number, (u8)pin);
	timer_detail::applyPeriod(number, timer_detail::resolveToneHalfPeriodMicros(frequencyHertz));
	timer_detail::startCounter(number);
}

void stopTone(core_gpio::Pin pin) {
	const u8 timerNumber = timer_detail::findToneTimer((u8)pin);

	if (timerNumber == timer_detail::TONE_NONE) {
		return;
	}

	timer_detail::stopCounter(timerNumber);
	timer_detail::clearTonePin(timerNumber);
	core_gpio::setDigital(pin, core_gpio::LOW);
}

u32 measurePulseWidth(core_gpio::Pin pin, core_gpio::DigitalLevel level, u32 timeoutMicros) {
	core_gpio::setMode(pin, core_gpio::INPUT);
	const timer_detail::PulseWidthProbe probe = {
		(u8)pin,
		timer_detail::readMicrosecondClock,
		timer_detail::readPinLevel,
	};
	return timer_detail::measurePulseWidthFromProbe(probe, (u8)level, timeoutMicros);
}

HardwareTimer getTimer(Timer selector) {
	switch (selector) {
		case Timer::TIMER_1: {
			return HardwareTimer((u8)Timer::TIMER_1);
		}
		case Timer::TIMER_2: {
			return HardwareTimer((u8)Timer::TIMER_2);
		}
		case Timer::TIMER_3: {
			return HardwareTimer((u8)Timer::TIMER_3);
		}
		case Timer::TIMER_4: {
			return HardwareTimer((u8)Timer::TIMER_4);
		}
		default: {
			return HardwareTimer();
		}
	}
}

} // namespace core_timer
