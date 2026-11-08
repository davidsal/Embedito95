#ifndef _E95_RUNTIME_HOST_STM32F1XX_LL_TIM_H
#define _E95_RUNTIME_HOST_STM32F1XX_LL_TIM_H
// Host stand-in for the STM32F1 LL timer header. It models TIM4 and the few
// LL_TIM calls the SoftwareSerial driver makes, plus the NVIC entry point it
// arms. Every enable/disable is observable so the closePort lifecycle test can
// assert that TIM4 is stopped, its interrupt disabled and its clock gated.
#include <stdint.h>

struct TIM_TypeDef {
	uint32_t CR1;
	uint32_t CNT;
	uint32_t PSC;
	uint32_t ARR;
	uint32_t SR;
};

inline TIM_TypeDef e95Tim4Registers = {};
#define TIM4 (&e95Tim4Registers)

typedef int32_t IRQn_Type;

static const IRQn_Type TIM4_IRQn = 30;
static const uint32_t LL_TIM_COUNTERMODE_UP = 0x00000000UL;
static const uint32_t LL_TIM_FLAG_UPDATE = 0x00000001UL;

inline bool e95SoftwareSerialTimerCounterEnabled = false;
inline bool e95SoftwareSerialTimerIrqEnabled = false;
inline uint16_t e95SoftwareSerialTimerCounterEnableCount = 0;
inline uint16_t e95SoftwareSerialTimerCounterDisableCount = 0;
inline uint16_t e95SoftwareSerialTimerIrqEnableCount = 0;
inline uint16_t e95SoftwareSerialTimerIrqDisableCount = 0;
inline uint16_t e95SoftwareSerialTimerNvicEnableCount = 0;
inline uint16_t e95SoftwareSerialTimerNvicDisableCount = 0;
inline IRQn_Type e95SoftwareSerialLastEnabledIrq = -1;

inline void LL_TIM_DisableCounter(TIM_TypeDef *timer) {
	(void)timer;
	e95SoftwareSerialTimerCounterEnabled = false;
	e95SoftwareSerialTimerCounterDisableCount++;
}

inline void LL_TIM_EnableCounter(TIM_TypeDef *timer) {
	(void)timer;
	e95SoftwareSerialTimerCounterEnabled = true;
	e95SoftwareSerialTimerCounterEnableCount++;
}

inline void LL_TIM_SetCounterMode(TIM_TypeDef *timer, uint32_t mode) {
	timer->CR1 = mode;
}

inline void LL_TIM_SetPrescaler(TIM_TypeDef *timer, uint32_t prescaler) {
	timer->PSC = prescaler;
}

inline void LL_TIM_SetAutoReload(TIM_TypeDef *timer, uint32_t autoReload) {
	timer->ARR = autoReload;
}

inline void LL_TIM_SetCounter(TIM_TypeDef *timer, uint32_t counter) {
	timer->CNT = counter;
}

inline void LL_TIM_GenerateEvent_UPDATE(TIM_TypeDef *timer) {
	timer->SR |= LL_TIM_FLAG_UPDATE;
}

inline void LL_TIM_ClearFlag_UPDATE(TIM_TypeDef *timer) {
	timer->SR &= ~LL_TIM_FLAG_UPDATE;
}

inline uint32_t LL_TIM_IsActiveFlag_UPDATE(const TIM_TypeDef *timer) {
	return timer->SR & LL_TIM_FLAG_UPDATE;
}

inline void LL_TIM_EnableIT_UPDATE(TIM_TypeDef *timer) {
	(void)timer;
	e95SoftwareSerialTimerIrqEnabled = true;
	e95SoftwareSerialTimerIrqEnableCount++;
}

inline void LL_TIM_DisableIT_UPDATE(TIM_TypeDef *timer) {
	(void)timer;
	e95SoftwareSerialTimerIrqEnabled = false;
	e95SoftwareSerialTimerIrqDisableCount++;
}

inline void NVIC_SetPriority(IRQn_Type interrupt, uint32_t priority) {
	(void)interrupt;
	(void)priority;
}

inline void NVIC_EnableIRQ(IRQn_Type interrupt) {
	e95SoftwareSerialTimerNvicEnableCount++;
	e95SoftwareSerialLastEnabledIrq = interrupt;
}

inline void NVIC_DisableIRQ(IRQn_Type interrupt) {
	(void)interrupt;
	e95SoftwareSerialTimerNvicDisableCount++;
}

#endif
