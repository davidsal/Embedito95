#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_exti.h"
#include "stm32f1xx_ll_gpio.h"
#include "core_interrupt.h"

namespace core_interrupt {

namespace detail {

// The F103 exposes sixteen external interrupt lines. AFIO_EXTICR selects the
// port that feeds each line, so PA0, PB0 and PC0 all share EXTI0: only one pin
// per line can be attached and the last attach wins. The backend resolves the
// pin by category (every digital pin maps to the line equal to its bit) and
// does not detect a second pin claiming an already-registered line.
const u8 EXTI_LINE_COUNT = 16;
const u8 EXTI0_4_LAST_LINE = 4;
const u8 EXTI5_9_FIRST_LINE = 5;
const u8 EXTI5_9_LAST_LINE = 9;
const u8 EXTI10_15_FIRST_LINE = 10;
const u8 EXTI10_15_LAST_LINE = 15;
const u8 EXTI_LINES_PER_REGISTER = 4;
const u8 AFIO_BITS_PER_LINE = 4;
const u8 AFIO_LINE_BIT_OFFSET = 16;
const u32 EXTI_SOURCE_MASK = 0x0000000FUL;
const u32 EXTI_BIT_ONE = 1UL;

typedef struct {
	u8 pin;
	u8 line;
	u32 port;
} PinInterrupt;

static const PinInterrupt PIN_INTERRUPTS[_e95_replace_interruptPinCount] = {
_e95_replace_interruptPins
};

// Handlers run in interrupt context: plain function pointers, no heap and no
// captured state. A line without a registered handler is a no-op.
static void (*handlers[EXTI_LINE_COUNT])() = {};

const PinInterrupt *findPinInterrupt(core_gpio::Pin pin) {
	for (u8 index = 0; index < _e95_replace_interruptPinCount; index++) {
		if (PIN_INTERRUPTS[index].pin == (u8)pin) {
			return &PIN_INTERRUPTS[index];
		}
	}
	return nullptr;
}

// LL_GPIO_AF_SetEXTISource expects the AFIO register index in its low byte and
// the four-bit source field position above bit 16.
u32 encodeExtiSourceLine(u8 line) {
	const u32 fieldPosition =
		(u32)(line % EXTI_LINES_PER_REGISTER) * AFIO_BITS_PER_LINE;
	const u32 registerIndex = line / EXTI_LINES_PER_REGISTER;
	return (EXTI_SOURCE_MASK << (AFIO_LINE_BIT_OFFSET + fieldPosition)) |
		   registerIndex;
}

IRQn_Type interruptForLine(u8 line) {
	if (line <= EXTI0_4_LAST_LINE) {
		return (IRQn_Type)(EXTI0_IRQn + line);
	}
	if (line <= EXTI5_9_LAST_LINE) {
		return EXTI9_5_IRQn;
	}
	return EXTI15_10_IRQn;
}

void configureTrigger(u8 line, InterruptMode mode) {
	const u32 bit = EXTI_BIT_ONE << line;

	switch (mode) {
	case INTERRUPT_RISING: {
		LL_EXTI_EnableRisingTrig_0_31(bit);
		LL_EXTI_DisableFallingTrig_0_31(bit);
		break;
	}
	case INTERRUPT_CHANGE: {
		LL_EXTI_EnableRisingTrig_0_31(bit);
		LL_EXTI_EnableFallingTrig_0_31(bit);
		break;
	}
	// EXTI latches edges only: a held low level cannot raise an interrupt, so
	// LOW is honored as the transition into low (falling edge).
	case INTERRUPT_LOW:
	case INTERRUPT_FALLING:
	default: {
		LL_EXTI_DisableRisingTrig_0_31(bit);
		LL_EXTI_EnableFallingTrig_0_31(bit);
		break;
	}
	}
}

void clearTriggers(u8 line) {
	const u32 bit = EXTI_BIT_ONE << line;
	LL_EXTI_DisableRisingTrig_0_31(bit);
	LL_EXTI_DisableFallingTrig_0_31(bit);
}

void registerLine(const PinInterrupt &entry, void (*handler)()) {
	const u8 line = entry.line;
	const u32 bit = EXTI_BIT_ONE << line;

	LL_APB2_GRP1_EnableClock(LL_APB2_GRP1_PERIPH_AFIO);
	LL_GPIO_AF_SetEXTISource(entry.port, encodeExtiSourceLine(line));
	// Pure interrupt line: the event mask (EMR) stays clear so no wakeup event
	// is generated alongside the interrupt.
	LL_EXTI_DisableEvent_0_31(bit);
	LL_EXTI_ClearFlag_0_31(bit);
	handlers[line] = handler;
	LL_EXTI_EnableIT_0_31(bit);
	NVIC_EnableIRQ(interruptForLine(line));
}

void dispatchLine(u8 line) {
	const u32 bit = EXTI_BIT_ONE << line;

	if (LL_EXTI_IsActiveFlag_0_31(bit) == 0) {
		return;
	}
	LL_EXTI_ClearFlag_0_31(bit);
	if (handlers[line] != nullptr) {
		handlers[line]();
	}
}

void dispatchLineRange(u8 firstLine, u8 lastLine) {
	for (u8 line = firstLine; line <= lastLine; line++) {
		dispatchLine(line);
	}
}

} // namespace detail

u8 getInterruptNumber(core_gpio::Pin pin) {
	const detail::PinInterrupt *entry = detail::findPinInterrupt(pin);
	if (entry == nullptr) {
		return INVALID_PIN;
	}
	return entry->line;
}

void attachPinInterrupt(
	core_gpio::Pin pin,
	void (*handler)(),
	InterruptMode mode) {
	const detail::PinInterrupt *entry = detail::findPinInterrupt(pin);
	if (entry == nullptr) {
		return;
	}
	detail::configureTrigger(entry->line, mode);
	detail::registerLine(*entry, handler);
}

void detachPinInterrupt(core_gpio::Pin pin) {
	const detail::PinInterrupt *entry = detail::findPinInterrupt(pin);
	if (entry == nullptr) {
		return;
	}
	const u8 line = entry->line;
	const u32 bit = detail::EXTI_BIT_ONE << line;

	LL_EXTI_DisableIT_0_31(bit);
	detail::clearTriggers(line);
	LL_EXTI_ClearFlag_0_31(bit);
	detail::handlers[line] = nullptr;
}

void enableInterrupts() {
	__enable_irq();
}

void disableInterrupts() {
	__disable_irq();
}

} // namespace core_interrupt

extern "C" void EXTI0_IRQHandler(void) {
	core_interrupt::detail::dispatchLine(0);
}

extern "C" void EXTI1_IRQHandler(void) {
	core_interrupt::detail::dispatchLine(1);
}

extern "C" void EXTI2_IRQHandler(void) {
	core_interrupt::detail::dispatchLine(2);
}

extern "C" void EXTI3_IRQHandler(void) {
	core_interrupt::detail::dispatchLine(3);
}

extern "C" void EXTI4_IRQHandler(void) {
	core_interrupt::detail::dispatchLine(4);
}

extern "C" void EXTI9_5_IRQHandler(void) {
	core_interrupt::detail::dispatchLineRange(
		core_interrupt::detail::EXTI5_9_FIRST_LINE,
		core_interrupt::detail::EXTI5_9_LAST_LINE);
}

extern "C" void EXTI15_10_IRQHandler(void) {
	core_interrupt::detail::dispatchLineRange(
		core_interrupt::detail::EXTI10_15_FIRST_LINE,
		core_interrupt::detail::EXTI10_15_LAST_LINE);
}
