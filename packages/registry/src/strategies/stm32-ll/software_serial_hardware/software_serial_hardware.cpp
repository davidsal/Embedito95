#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_tim.h"
#include "stm32f1xx_ll_utils.h"

#include "../gpio/core_gpio.h"
#include "../time/core_time.h"
#include "core_software_serial_hardware.h"

namespace core_software_serial_hardware {

_e95_replace_software_serial_state

_e95_replace_software_serial_stream

_e95_replace_serialCommon

namespace software_serial_detail {

// TIM4 lives on APB1, but the F1 clock tree doubles the APB1 timer clock when
// the APB1 prescaler is not 1, so at 72 MHz system clock TIM4 counts at 72 MHz.
const u32 TIMER_CLOCK = _e95_replace_frequency;
const u32 MAXIMUM_COUNTER_PERIOD = 65536;
const u32 MINIMUM_BAUD_RATE = 300;
const u32 MAXIMUM_BAUD_RATE = 115200;
const u8 RECEIVE_TIMER_IRQ_PRIORITY = 1;

struct TimerDivision {
	u16 prescaler;
	u16 autoReload;
};

volatile ReceiveBuffer receiveBuffer;
volatile ReceiveState receiveState;
volatile u8 activeReceivePin = NO_PIN;
u32 transmitBitCyclesByPin[PIN_COUNT];
u32 receiveBaudRateByPin[PIN_COUNT];

u32 saveAndDisableInterrupts() {
	const u32 savedState = __get_PRIMASK();
	__disable_irq();
	return savedState;
}

void restoreInterruptState(u32 savedState) {
	__set_PRIMASK(savedState);
}

u32 readCycleCount() {
	CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
	DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
	return DWT->CYCCNT;
}

void waitCycles(u32 cycles) {
	const u32 startCycles = readCycleCount();
	while ((u32)(DWT->CYCCNT - startCycles) < cycles) {
	}
}

TimerDivision computeTimerDivision(u32 baudRate) {
	const u32 ticksPerBit = TIMER_CLOCK / ((u32)baudRate * OVERSAMPLE_FACTOR);
	const u32 prescaler =
		(ticksPerBit + MAXIMUM_COUNTER_PERIOD - 1) / MAXIMUM_COUNTER_PERIOD;
	const u32 ticks = ticksPerBit / prescaler;
	const TimerDivision division = {
		(u16)(prescaler - 1),
		(u16)(ticks - 1),
	};
	return division;
}

void configureReceiveTimer(u32 baudRate) {
	const TimerDivision division = computeTimerDivision(baudRate);

	LL_APB1_GRP1_EnableClock(LL_APB1_GRP1_PERIPH_TIM4);
	LL_TIM_DisableCounter(TIM4);
	LL_TIM_SetCounterMode(TIM4, LL_TIM_COUNTERMODE_UP);
	LL_TIM_SetPrescaler(TIM4, division.prescaler);
	LL_TIM_SetAutoReload(TIM4, division.autoReload);
	LL_TIM_SetCounter(TIM4, 0);
	LL_TIM_GenerateEvent_UPDATE(TIM4);
	LL_TIM_ClearFlag_UPDATE(TIM4);
}

void enableReceiveTimer() {
	NVIC_SetPriority(TIM4_IRQn, RECEIVE_TIMER_IRQ_PRIORITY);
	NVIC_EnableIRQ(TIM4_IRQn);
	LL_TIM_ClearFlag_UPDATE(TIM4);
	LL_TIM_EnableIT_UPDATE(TIM4);
	LL_TIM_EnableCounter(TIM4);
}

void disableReceiveTimer() {
	LL_TIM_DisableCounter(TIM4);
	LL_TIM_DisableIT_UPDATE(TIM4);
	NVIC_DisableIRQ(TIM4_IRQn);
	LL_TIM_ClearFlag_UPDATE(TIM4);
}

void releaseReceiveTimer() {
	disableReceiveTimer();
	LL_APB1_GRP1_DisableClock(LL_APB1_GRP1_PERIPH_TIM4);
}

void resetReceive() {
	resetReceiveBuffer(receiveBuffer);
	resetReceiveState(receiveState);
}

void configureTransmitPin(core_gpio::Pin pin) {
	core_gpio::setMode(pin, core_gpio::OUTPUT);
	core_gpio::setDigital(pin, core_gpio::HIGH);
}

void releaseTransmitPin(core_gpio::Pin pin) {
	core_gpio::setDigital(pin, core_gpio::LOW);
	core_gpio::setMode(pin, core_gpio::INPUT);
}

void writeTransmitLevel(core_gpio::Pin pin, boolean high) {
	core_gpio::setDigital(pin, high ? core_gpio::HIGH : core_gpio::LOW);
}

void handleReceiveTick() {
	if (activeReceivePin == NO_PIN) {
		return;
	}
	const boolean lineHigh =
		core_gpio::getDigital((core_gpio::Pin)activeReceivePin) == core_gpio::HIGH;
	processReceiveTick(receiveState, receiveBuffer, lineHigh);
}

} // namespace software_serial_detail

u8 getReceiveCapacity() {
	return software_serial_detail::RECEIVE_CAPACITY;
}

boolean isBaudRateSupported(u32 baudRate) {
	return baudRate >= software_serial_detail::MINIMUM_BAUD_RATE &&
		   baudRate <= software_serial_detail::MAXIMUM_BAUD_RATE;
}

boolean isReceivePin(core_gpio::Pin pin) {
	return (u8)pin < PIN_COUNT;
}

u8 getPinChangeGroup(core_gpio::Pin pin) {
	// The STM32 receiver is driven by the TIM4 update interrupt, not by the AVR
	// pin-change groups, so no group exists for any pin.
	(void)pin;
	return software_serial_detail::NO_PIN;
}

u8 getPinChangeBit(core_gpio::Pin pin) {
	(void)pin;
	return software_serial_detail::NO_PIN;
}

boolean openPort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin, u32 baudRate) {
	if (!isBaudRateSupported(baudRate)) {
		return false;
	}

	const boolean hasTransmitPin = (u8)transmitPin < PIN_COUNT;
	const boolean hasReceivePin = isReceivePin(receivePin);

	if (!hasTransmitPin && !hasReceivePin) {
		return false;
	}

	if (hasTransmitPin) {
		software_serial_detail::transmitBitCyclesByPin[(u8)transmitPin] =
			software_serial_detail::TIMER_CLOCK / baudRate;
		software_serial_detail::configureTransmitPin(transmitPin);
	}

	if (hasReceivePin) {
		software_serial_detail::receiveBaudRateByPin[(u8)receivePin] = baudRate;
		core_gpio::setMode(receivePin, core_gpio::INPUT_PULLUP);
	}

	return true;
}

void closePort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	const u8 transmitNumber = (u8)transmitPin;

	if (transmitNumber < PIN_COUNT &&
		software_serial_detail::transmitBitCyclesByPin[transmitNumber] != 0) {
		software_serial_detail::releaseTransmitPin(transmitPin);
		software_serial_detail::transmitBitCyclesByPin[transmitNumber] = 0;
	}

	if (!isReceivePin(receivePin)) {
		return;
	}

	const u8 receiveNumber = (u8)receivePin;
	const boolean ownsReceiveLine =
		software_serial_detail::activeReceivePin == receiveNumber;
	const boolean receiverInitialized =
		software_serial_detail::receiveBaudRateByPin[receiveNumber] != 0;

	software_serial_detail::receiveBaudRateByPin[receiveNumber] = 0;

	if (!ownsReceiveLine) {
		// Another pin owns the single receive timer, so only this handle's
		// registration is released. With nobody listening, a handle that had
		// initialized the receiver still has to release the timer it started.
		if (software_serial_detail::activeReceivePin != software_serial_detail::NO_PIN) {
			return;
		}
		if (!receiverInitialized) {
			return;
		}
	} else {
		stopReceive(receivePin);
	}

	software_serial_detail::resetReceive();
	software_serial_detail::releaseReceiveTimer();
}

void startReceive(core_gpio::Pin receivePin) {
	if (!isReceivePin(receivePin)) {
		return;
	}

	const u8 receiveNumber = (u8)receivePin;
	const u32 baudRate =
		software_serial_detail::receiveBaudRateByPin[receiveNumber];

	if (baudRate == 0) {
		return;
	}

	if (software_serial_detail::activeReceivePin == receiveNumber) {
		software_serial_detail::resetReceive();
		software_serial_detail::configureReceiveTimer(baudRate);
		software_serial_detail::enableReceiveTimer();
		return;
	}

	software_serial_detail::disableReceiveTimer();
	software_serial_detail::activeReceivePin = receiveNumber;
	software_serial_detail::configureReceiveTimer(baudRate);
	software_serial_detail::resetReceive();
	software_serial_detail::enableReceiveTimer();
}

void stopReceive(core_gpio::Pin receivePin) {
	if (software_serial_detail::activeReceivePin != (u8)receivePin) {
		return;
	}
	software_serial_detail::disableReceiveTimer();
	software_serial_detail::activeReceivePin = software_serial_detail::NO_PIN;
}

boolean isReceiving(core_gpio::Pin receivePin) {
	return software_serial_detail::activeReceivePin == (u8)receivePin;
}

void sendByte(core_gpio::Pin transmitPin, u8 value) {
	const u8 transmitNumber = (u8)transmitPin;

	if (transmitNumber >= PIN_COUNT) {
		return;
	}

	const u32 bitCycles =
		software_serial_detail::transmitBitCyclesByPin[transmitNumber];

	if (bitCycles == 0) {
		return;
	}

	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();

	software_serial_detail::writeTransmitLevel(transmitPin, false);
	software_serial_detail::waitCycles(bitCycles);

	for (u8 index = 0; index < software_serial_detail::DATA_BIT_COUNT; index++) {
		software_serial_detail::writeTransmitLevel(
			transmitPin, (boolean)((value & (u8)(1 << index)) != 0));
		software_serial_detail::waitCycles(bitCycles);
	}

	software_serial_detail::writeTransmitLevel(transmitPin, true);
	software_serial_detail::restoreInterruptState(savedState);
	software_serial_detail::waitCycles(bitCycles);
}

boolean hasBufferedData() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result =
		software_serial_detail::hasBufferedByte(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

u8 readBufferedByte() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const u8 value =
		software_serial_detail::readBufferedByte(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

u8 peekBufferedByte() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const u8 value =
		software_serial_detail::peekBufferedByte(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

boolean hasReceiveOverflow() {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result =
		software_serial_detail::hasOverflowed(software_serial_detail::receiveBuffer);
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

void storeReceivedByte(u8 value) {
	const u32 savedState = software_serial_detail::saveAndDisableInterrupts();
	software_serial_detail::storeByte(software_serial_detail::receiveBuffer, value);
	software_serial_detail::restoreInterruptState(savedState);
}

core_string::String readStreamLine() {
	software_serial_detail::BufferedReceivePort port;
	core_string::String line;
	serial_detail::readLineInto(
		port,
		line,
		serial_detail::READ_TIMEOUT_MILLIS,
		&core_time::getMillis,
		serial_detail::NEWLINE_CHARACTER);
	return line;
}

i32 readStreamInteger() {
	software_serial_detail::BufferedReceivePort port;
	return serial_detail::readIntegerFrom(
		port,
		serial_detail::READ_TIMEOUT_MILLIS,
		&core_time::getMillis);
}

} // namespace core_software_serial_hardware

extern "C" void TIM4_IRQHandler(void) {
	if (LL_TIM_IsActiveFlag_UPDATE(TIM4) == 0) {
		return;
	}
	LL_TIM_ClearFlag_UPDATE(TIM4);
	core_software_serial_hardware::software_serial_detail::handleReceiveTick();
}
