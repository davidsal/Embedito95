#ifndef _E95_RUNTIME_HOST_STM32F1XX_LL_EXTI_H
#define _E95_RUNTIME_HOST_STM32F1XX_LL_EXTI_H
// Host stand-in for the STM32F1 LL EXTI header. It models the mask, trigger and
// pending registers the generated `core_interrupt.cpp` touches, the NVIC entry
// points it enables and the CMSIS global interrupt gate, so attach/detach,
// trigger selection and ISR dispatch can be exercised on the host.
#include <stdint.h>

struct EXTI_TypeDef {
	uint32_t IMR;
	uint32_t EMR;
	uint32_t RTSR;
	uint32_t FTSR;
	uint32_t SWIER;
	uint32_t PR;
};

inline EXTI_TypeDef e95ExtiRegisters = {};
#define EXTI (&e95ExtiRegisters)

typedef int32_t IRQn_Type;

static const IRQn_Type EXTI0_IRQn = 6;
static const IRQn_Type EXTI1_IRQn = 7;
static const IRQn_Type EXTI2_IRQn = 8;
static const IRQn_Type EXTI3_IRQn = 9;
static const IRQn_Type EXTI4_IRQn = 10;
static const IRQn_Type EXTI9_5_IRQn = 23;
static const IRQn_Type EXTI15_10_IRQn = 40;

inline uint16_t e95ExtiEnabledIrqCount = 0;
inline IRQn_Type e95ExtiLastEnabledIrq = -1;
inline uint16_t e95ExtiEventDisableCount = 0;
inline uint16_t e95InterruptEnableCount = 0;
inline uint16_t e95InterruptDisableCount = 0;

inline void LL_EXTI_EnableIT_0_31(uint32_t extiLine) {
	EXTI->IMR |= extiLine;
}

inline void LL_EXTI_DisableIT_0_31(uint32_t extiLine) {
	EXTI->IMR &= ~extiLine;
}

inline void LL_EXTI_EnableEvent_0_31(uint32_t extiLine) {
	EXTI->EMR |= extiLine;
}

inline void LL_EXTI_DisableEvent_0_31(uint32_t extiLine) {
	EXTI->EMR &= ~extiLine;
	e95ExtiEventDisableCount++;
}

inline void LL_EXTI_EnableRisingTrig_0_31(uint32_t extiLine) {
	EXTI->RTSR |= extiLine;
}

inline void LL_EXTI_DisableRisingTrig_0_31(uint32_t extiLine) {
	EXTI->RTSR &= ~extiLine;
}

inline void LL_EXTI_EnableFallingTrig_0_31(uint32_t extiLine) {
	EXTI->FTSR |= extiLine;
}

inline void LL_EXTI_DisableFallingTrig_0_31(uint32_t extiLine) {
	EXTI->FTSR &= ~extiLine;
}

inline uint32_t LL_EXTI_IsActiveFlag_0_31(uint32_t extiLine) {
	return EXTI->PR & extiLine;
}

inline void LL_EXTI_ClearFlag_0_31(uint32_t extiLine) {
	EXTI->PR &= ~extiLine;
}

inline void NVIC_EnableIRQ(IRQn_Type interrupt) {
	e95ExtiEnabledIrqCount++;
	e95ExtiLastEnabledIrq = interrupt;
}

inline void NVIC_DisableIRQ(IRQn_Type interrupt) {
	(void)interrupt;
}

inline void __enable_irq() {
	e95InterruptEnableCount++;
}

inline void __disable_irq() {
	e95InterruptDisableCount++;
}

#endif
