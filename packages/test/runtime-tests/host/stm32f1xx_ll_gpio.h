#ifndef _E95_RUNTIME_HOST_STM32F1XX_LL_GPIO_H
#define _E95_RUNTIME_HOST_STM32F1XX_LL_GPIO_H
// Host stand-in for the STM32F1 LL GPIO header. The SPI driver only needs the
// pin-mode call it uses to park the bus pins, so the stand-in models that call
// and the pin-set helpers the shared GPIO header references inline.
#include <stdint.h>

struct GPIO_TypeDef {
	uint32_t CRL;
	uint32_t CRH;
	uint32_t IDR;
	uint32_t ODR;
};

static const uint32_t LL_GPIO_AF_EXTI_PORTA = 0UL;
static const uint32_t LL_GPIO_AF_EXTI_PORTB = 1UL;
static const uint32_t LL_GPIO_AF_EXTI_PORTC = 2UL;

static const uint32_t LL_GPIO_MODE_ANALOG = 0x00000000UL;
static const uint32_t LL_GPIO_OUTPUT_OPENDRAIN = 0x00000000UL;
static const uint32_t LL_GPIO_PULL_UP = 0x00000000UL;

// Observable bookkeeping for the SPI close() scenarios: the driver parks its
// three bus pins by calling LL_GPIO_SetPinMode with the analog mode, so the
// test can assert both the call count and the requested mode.
inline uint16_t e95HostPinModeCallCount = 0;
inline uint32_t e95HostLastPinMode = 0xFFFFFFFFUL;

// The EXTI backend routes a pin to its AFIO_EXTICR field through this call; the
// test records the raw arguments so it can assert the port and the line field.
inline uint16_t e95HostExtiSourceCallCount = 0;
inline uint32_t e95HostExtiSourcePort = 0xFFFFFFFFUL;
inline uint32_t e95HostExtiSourceLine = 0xFFFFFFFFUL;

inline void LL_GPIO_AF_SetEXTISource(uint32_t port, uint32_t line) {
	e95HostExtiSourceCallCount++;
	e95HostExtiSourcePort = port;
	e95HostExtiSourceLine = line;
}

inline void LL_GPIO_SetPinMode(GPIO_TypeDef *port, uint32_t pin, uint32_t mode) {
	(void)port;
	(void)pin;
	e95HostPinModeCallCount++;
	e95HostLastPinMode = mode;
}

inline void LL_GPIO_SetPinOutputType(
	GPIO_TypeDef *port,
	uint32_t pin,
	uint32_t outputType) {
	(void)port;
	(void)pin;
	(void)outputType;
}

inline void LL_GPIO_SetPinPull(GPIO_TypeDef *port, uint32_t pin, uint32_t pull) {
	(void)port;
	(void)pin;
	(void)pull;
}

inline void LL_GPIO_SetOutputPin(GPIO_TypeDef *port, uint32_t pin) {
	port->ODR |= pin;
}

inline void LL_GPIO_ResetOutputPin(GPIO_TypeDef *port, uint32_t pin) {
	port->ODR &= ~pin;
}

inline uint32_t LL_GPIO_IsInputPinSet(const GPIO_TypeDef *port, uint32_t pin) {
	return port->IDR & pin;
}

#endif
