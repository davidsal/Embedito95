#ifndef _E95_RUNTIME_HOST_STM32F1XX_LL_BUS_H
#define _E95_RUNTIME_HOST_STM32F1XX_LL_BUS_H
// Host stand-in for the STM32F1 LL bus header: the SPI and SoftwareSerial
// clock-enable calls are tracked so the test can assert the driver runs without
// touching hardware. The TIM4 gate keeps its own observable state because the
// SoftwareSerial close path must prove it powered the timer down.
#include <stdint.h>

static const uint32_t LL_APB2_GRP1_PERIPH_AFIO = 0x00000001UL;
static const uint32_t LL_APB2_GRP1_PERIPH_SPI1 = 0x00001000UL;
static const uint32_t LL_APB1_GRP1_PERIPH_TIM4 = 0x00000002UL;
static const uint32_t LL_APB1_GRP1_PERIPH_SPI2 = 0x00004000UL;
static const uint32_t LL_APB1_GRP1_PERIPH_I2C1 = 0x00200000UL;
static const uint32_t LL_APB1_GRP1_PERIPH_I2C2 = 0x00400000UL;

inline uint32_t e95EnabledSpiClockCount = 0;
inline bool e95SoftwareSerialTimerClockEnabled = false;
inline uint16_t e95SoftwareSerialTimerClockEnableCount = 0;
inline uint16_t e95SoftwareSerialTimerClockDisableCount = 0;

inline void LL_APB2_GRP1_EnableClock(uint32_t peripheral) {
	(void)peripheral;
	e95EnabledSpiClockCount++;
}

inline void LL_APB1_GRP1_EnableClock(uint32_t peripheral) {
	e95EnabledSpiClockCount++;
	if (peripheral == LL_APB1_GRP1_PERIPH_TIM4) {
		e95SoftwareSerialTimerClockEnabled = true;
		e95SoftwareSerialTimerClockEnableCount++;
	}
}

inline void LL_APB1_GRP1_DisableClock(uint32_t peripheral) {
	if (peripheral == LL_APB1_GRP1_PERIPH_TIM4) {
		e95SoftwareSerialTimerClockEnabled = false;
		e95SoftwareSerialTimerClockDisableCount++;
	}
}

#endif
