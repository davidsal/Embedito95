// Host compile+behaviour guard for the generated STM32 interrupt engine source
// (snapshots/engine/interrupt/core_interrupt.cpp). The real generated source is
// compiled against host EXTI/NVIC stand-ins, so attach/detach, trigger
// selection, line routing and ISR dispatch are checked without hardware.
//
// The F103 shares EXTI0..EXTI15 by pin number through AFIO_EXTICR: PA0 and PB0
// both feed line 0, and the backend intentionally keeps a single handler per
// line (the last attach wins).

#include "packages/test/src/stm32-bluepill/snapshots/engine/interrupt/core_interrupt.cpp"

#include <stdint.h>
#include <stdio.h>

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static const uint8_t LINE_ZERO = 0;
static const uint8_t LINE_SIX = 6;
static const uint8_t LINE_THIRTEEN = 13;
static const uint32_t LINE_ZERO_BIT = 1UL << LINE_ZERO;
static const uint32_t LINE_SIX_BIT = 1UL << LINE_SIX;
static const uint32_t LINE_THIRTEEN_BIT = 1UL << LINE_THIRTEEN;

static uint8_t firstHandlerCalls = 0;
static uint8_t secondHandlerCalls = 0;

static void firstHandler() {
	firstHandlerCalls++;
}

static void secondHandler() {
	secondHandlerCalls++;
}

static void resetHardware() {
	EXTI->IMR = 0;
	EXTI->EMR = 0;
	EXTI->RTSR = 0;
	EXTI->FTSR = 0;
	EXTI->SWIER = 0;
	EXTI->PR = 0;
	e95ExtiEnabledIrqCount = 0;
	e95ExtiLastEnabledIrq = -1;
	e95ExtiEventDisableCount = 0;
	e95InterruptEnableCount = 0;
	e95InterruptDisableCount = 0;
	e95HostExtiSourceCallCount = 0;
	e95HostExtiSourcePort = 0xFFFFFFFFUL;
	e95HostExtiSourceLine = 0xFFFFFFFFUL;
	e95EnabledSpiClockCount = 0;
	firstHandlerCalls = 0;
	secondHandlerCalls = 0;
}

// The LL GPIO EXTI source helper receives the AFIO register index in the low
// byte and the four-bit field position above bit 16.
static uint32_t decodeExtiSourceRegister(uint32_t encodedLine) {
	return encodedLine & 0xFFUL;
}

static uint32_t decodeExtiSourceField(uint32_t encodedLine) {
	return encodedLine >> 16;
}

static void scenarioReportsExtiLines() {
	resetHardware();

	CHECK(core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_A0) == LINE_ZERO);
	CHECK(core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_B6) == LINE_SIX);
	CHECK(
		core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_C13) ==
		LINE_THIRTEEN);
	CHECK(
		core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_C14) ==
		core_interrupt::INVALID_PIN);
}

static void scenarioAliasPinResolvesToPhysicalLine() {
	resetHardware();

	CHECK(
		core_interrupt::getInterruptNumber(core_gpio::Pin::PIN_LED_BUILTIN) ==
		LINE_THIRTEEN);

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_LED_BUILTIN,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_CHANGE);

	CHECK((EXTI->IMR & LINE_THIRTEEN_BIT) != 0);
	CHECK(e95HostExtiSourcePort == LL_GPIO_AF_EXTI_PORTC);
	CHECK(e95ExtiLastEnabledIrq == EXTI15_10_IRQn);

	EXTI->PR = LINE_THIRTEEN_BIT;
	EXTI15_10_IRQHandler();

	CHECK(firstHandlerCalls == 1);

	core_interrupt::detachPinInterrupt(core_gpio::Pin::PIN_LED_BUILTIN);

	CHECK((EXTI->IMR & LINE_THIRTEEN_BIT) == 0);
}

static void scenarioAttachesRisingEdge() {
	resetHardware();

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_A0,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_RISING);

	CHECK((EXTI->IMR & LINE_ZERO_BIT) != 0);
	CHECK((EXTI->RTSR & LINE_ZERO_BIT) != 0);
	CHECK((EXTI->FTSR & LINE_ZERO_BIT) == 0);
	CHECK((EXTI->EMR & LINE_ZERO_BIT) == 0);
	CHECK(e95EnabledSpiClockCount == 1);
	CHECK(e95HostExtiSourcePort == LL_GPIO_AF_EXTI_PORTA);
	CHECK(decodeExtiSourceRegister(e95HostExtiSourceLine) == 0);
	CHECK(decodeExtiSourceField(e95HostExtiSourceLine) == 0x000FUL);
	CHECK(e95ExtiLastEnabledIrq == EXTI0_IRQn);

	EXTI->PR = LINE_ZERO_BIT;
	EXTI0_IRQHandler();

	CHECK(firstHandlerCalls == 1);
	CHECK((EXTI->PR & LINE_ZERO_BIT) == 0);
}

static void scenarioAttachesFallingEdgeOnSharedIrq() {
	resetHardware();

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_B6,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_FALLING);

	CHECK((EXTI->IMR & LINE_SIX_BIT) != 0);
	CHECK((EXTI->FTSR & LINE_SIX_BIT) != 0);
	CHECK((EXTI->RTSR & LINE_SIX_BIT) == 0);
	CHECK(e95HostExtiSourcePort == LL_GPIO_AF_EXTI_PORTB);
	CHECK(decodeExtiSourceRegister(e95HostExtiSourceLine) == 1);
	CHECK(e95ExtiLastEnabledIrq == EXTI9_5_IRQn);

	EXTI->PR = LINE_SIX_BIT;
	EXTI9_5_IRQHandler();

	CHECK(firstHandlerCalls == 1);
}

static void scenarioAttachesChangeTrigger() {
	resetHardware();

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_A0,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_CHANGE);

	CHECK((EXTI->RTSR & LINE_ZERO_BIT) != 0);
	CHECK((EXTI->FTSR & LINE_ZERO_BIT) != 0);
}

static void scenarioTreatsLowAsFallingEdge() {
	resetHardware();

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_A0,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_LOW);

	CHECK((EXTI->FTSR & LINE_ZERO_BIT) != 0);
	CHECK((EXTI->RTSR & LINE_ZERO_BIT) == 0);
}

static void scenarioReattachingSameLineKeepsLastHandler() {
	resetHardware();

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_A0,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_RISING);
	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_B0,
		secondHandler,
		core_interrupt::InterruptMode::INTERRUPT_FALLING);

	CHECK(e95HostExtiSourcePort == LL_GPIO_AF_EXTI_PORTB);

	EXTI->PR = LINE_ZERO_BIT;
	EXTI0_IRQHandler();

	CHECK(firstHandlerCalls == 0);
	CHECK(secondHandlerCalls == 1);
}

static void scenarioDetachesInterrupt() {
	resetHardware();

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_A0,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_RISING);
	core_interrupt::detachPinInterrupt(core_gpio::Pin::PIN_A0);

	CHECK((EXTI->IMR & LINE_ZERO_BIT) == 0);
	CHECK((EXTI->RTSR & LINE_ZERO_BIT) == 0);
	CHECK((EXTI->FTSR & LINE_ZERO_BIT) == 0);

	EXTI->PR = LINE_ZERO_BIT;
	EXTI0_IRQHandler();

	CHECK(firstHandlerCalls == 0);
	CHECK((EXTI->PR & LINE_ZERO_BIT) == 0);
}

static void scenarioIgnoresPinWithoutLine() {
	resetHardware();

	core_interrupt::attachPinInterrupt(
		core_gpio::Pin::PIN_C14,
		firstHandler,
		core_interrupt::InterruptMode::INTERRUPT_RISING);
	core_interrupt::detachPinInterrupt(core_gpio::Pin::PIN_C14);

	CHECK(EXTI->IMR == 0);
	CHECK(e95HostExtiSourceCallCount == 0);
	CHECK(e95ExtiEnabledIrqCount == 0);
}

static void scenarioEnableAndDisableInterrupts() {
	resetHardware();

	core_interrupt::enableInterrupts();
	core_interrupt::disableInterrupts();

	CHECK(e95InterruptEnableCount == 1);
	CHECK(e95InterruptDisableCount == 1);
}

static void scenarioDispatchWithoutHandlerClearsPending() {
	resetHardware();

	EXTI->PR = LINE_ZERO_BIT;
	EXTI0_IRQHandler();

	CHECK((EXTI->PR & LINE_ZERO_BIT) == 0);
}

int main() {
	scenarioReportsExtiLines();
	scenarioAliasPinResolvesToPhysicalLine();
	scenarioAttachesRisingEdge();
	scenarioAttachesFallingEdgeOnSharedIrq();
	scenarioAttachesChangeTrigger();
	scenarioTreatsLowAsFallingEdge();
	scenarioReattachingSameLineKeepsLastHandler();
	scenarioDetachesInterrupt();
	scenarioIgnoresPinWithoutLine();
	scenarioEnableAndDisableInterrupts();
	scenarioDispatchWithoutHandlerClearsPending();

	if (failures == 0) {
		printf("PASS interrupt-stm32-config\n");
	}
	return failures == 0 ? 0 : 1;
}
