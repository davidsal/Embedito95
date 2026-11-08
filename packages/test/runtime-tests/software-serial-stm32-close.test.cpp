// Host compile+behaviour guard for the generated STM32 SoftwareSerial driver
// close path (stm32-bluepill/snapshots/engine/software_serial_hardware/
// core_software_serial_hardware.cpp). The real generated source is compiled
// against the host TIM4/NVIC stand-ins, so the four closePort() lifecycles that
// must (or must not) release TIM4 run without an STM32: the shared timer is
// clock-gated, its update interrupt disabled and its counter stopped only by
// the handle that owns, or last initialized, the receive line.

#include "packages/test/src/stm32-bluepill/snapshots/engine/software_serial_hardware/core_software_serial_hardware.cpp"
#include "packages/test/src/stm32-bluepill/snapshots/engine/type/core_string.cpp"

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

static GPIO_TypeDef testGpioPort = {};

namespace core_gpio {

const _e95_PinInfo _e95_PINS[36] = {
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
	{ &testGpioPort, 0 }, { &testGpioPort, 0 }, { &testGpioPort, 0 },
};

void _e95_setPinAlternate(Pin pin) {
	(void)pin;
}

void setMode(Pin pin, PinMode mode) {
	(void)pin;
	(void)mode;
}

} // namespace core_gpio

namespace core_time {

u32 getMillis(void) {
	return 0;
}

} // namespace core_time

static const u32 BAUD_RATE = 9600;
static const core_gpio::Pin TRANSMIT_PIN = core_gpio::PIN_A0;
static const core_gpio::Pin RECEIVE_PIN = core_gpio::PIN_A1;
static const core_gpio::Pin OTHER_TRANSMIT_PIN = core_gpio::PIN_A2;
static const core_gpio::Pin OTHER_RECEIVE_PIN = core_gpio::PIN_A3;

static void resetTimerObservables() {
	e95SoftwareSerialTimerClockEnabled = false;
	e95SoftwareSerialTimerClockEnableCount = 0;
	e95SoftwareSerialTimerClockDisableCount = 0;
	e95SoftwareSerialTimerCounterEnabled = false;
	e95SoftwareSerialTimerCounterEnableCount = 0;
	e95SoftwareSerialTimerCounterDisableCount = 0;
	e95SoftwareSerialTimerIrqEnabled = false;
	e95SoftwareSerialTimerIrqEnableCount = 0;
	e95SoftwareSerialTimerIrqDisableCount = 0;
	e95SoftwareSerialTimerNvicEnableCount = 0;
	e95SoftwareSerialTimerNvicDisableCount = 0;
	e95SoftwareSerialLastEnabledIrq = -1;
	e95Tim4Registers = TIM_TypeDef();
}

static void resetDriver() {
	core_software_serial_hardware::software_serial_detail::resetReceiveBuffer(
		core_software_serial_hardware::software_serial_detail::receiveBuffer);
	core_software_serial_hardware::software_serial_detail::resetReceiveState(
		core_software_serial_hardware::software_serial_detail::receiveState);
	core_software_serial_hardware::software_serial_detail::activeReceivePin =
		core_software_serial_hardware::software_serial_detail::NO_PIN;
	for (
		u16 pinIndex = 0;
		pinIndex < core_software_serial_hardware::PIN_COUNT;
		pinIndex++) {
		core_software_serial_hardware::software_serial_detail::
			transmitBitCyclesByPin[pinIndex] = 0;
		core_software_serial_hardware::software_serial_detail::
			receiveBaudRateByPin[pinIndex] = 0;
	}
	resetTimerObservables();
}

static bool timerIsActive() {
	return e95SoftwareSerialTimerClockEnabled &&
		   e95SoftwareSerialTimerCounterEnabled &&
		   e95SoftwareSerialTimerIrqEnabled;
}

static void startListening(core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	core_software_serial_hardware::openPort(transmitPin, receivePin, BAUD_RATE);
	core_software_serial_hardware::startReceive(receivePin);
}

static void scenarioReleasesTimerAfterStopListening() {
	resetDriver();
	startListening(TRANSMIT_PIN, RECEIVE_PIN);
	CHECK(timerIsActive());

	core_software_serial_hardware::stopReceive(RECEIVE_PIN);
	core_software_serial_hardware::closePort(TRANSMIT_PIN, RECEIVE_PIN);

	CHECK(!e95SoftwareSerialTimerClockEnabled);
	CHECK(!e95SoftwareSerialTimerCounterEnabled);
	CHECK(!e95SoftwareSerialTimerIrqEnabled);
	CHECK(e95SoftwareSerialTimerClockDisableCount == 1);
	CHECK(e95SoftwareSerialTimerNvicDisableCount >= 1);
	CHECK(
		core_software_serial_hardware::software_serial_detail::
			transmitBitCyclesByPin[(u8)TRANSMIT_PIN] == 0);
}

static void scenarioKeepsTheTimerOfAnotherListener() {
	resetDriver();
	startListening(OTHER_TRANSMIT_PIN, OTHER_RECEIVE_PIN);
	core_software_serial_hardware::openPort(
		TRANSMIT_PIN, RECEIVE_PIN, BAUD_RATE);

	core_software_serial_hardware::closePort(TRANSMIT_PIN, RECEIVE_PIN);

	CHECK(e95SoftwareSerialTimerClockEnabled);
	CHECK(e95SoftwareSerialTimerCounterEnabled);
	CHECK(e95SoftwareSerialTimerIrqEnabled);
	CHECK(e95SoftwareSerialTimerClockDisableCount == 0);
	CHECK(
		core_software_serial_hardware::software_serial_detail::activeReceivePin ==
		(u8)OTHER_RECEIVE_PIN);
	CHECK(core_software_serial_hardware::isReceiving(OTHER_RECEIVE_PIN));

	core_software_serial_hardware::closePort(
		OTHER_TRANSMIT_PIN, OTHER_RECEIVE_PIN);
}

static void scenarioIgnoresCloseWithoutReceiveInitialization() {
	resetDriver();

	core_software_serial_hardware::closePort(TRANSMIT_PIN, RECEIVE_PIN);

	CHECK(!e95SoftwareSerialTimerClockEnabled);
	CHECK(!e95SoftwareSerialTimerCounterEnabled);
	CHECK(!e95SoftwareSerialTimerIrqEnabled);
	CHECK(e95SoftwareSerialTimerClockEnableCount == 0);
	CHECK(e95SoftwareSerialTimerClockDisableCount == 0);
	CHECK(e95SoftwareSerialTimerCounterEnableCount == 0);
	CHECK(e95SoftwareSerialTimerCounterDisableCount == 0);
	CHECK(e95SoftwareSerialTimerIrqEnableCount == 0);
	CHECK(e95SoftwareSerialTimerIrqDisableCount == 0);
	CHECK(e95SoftwareSerialTimerNvicEnableCount == 0);
	CHECK(e95SoftwareSerialTimerNvicDisableCount == 0);
	CHECK(
		core_software_serial_hardware::software_serial_detail::activeReceivePin ==
		core_software_serial_hardware::software_serial_detail::NO_PIN);
}

static void scenarioStopsAndReleasesWhenOwnerCloses() {
	resetDriver();
	startListening(TRANSMIT_PIN, RECEIVE_PIN);
	CHECK(timerIsActive());

	core_software_serial_hardware::closePort(TRANSMIT_PIN, RECEIVE_PIN);

	CHECK(!e95SoftwareSerialTimerClockEnabled);
	CHECK(!e95SoftwareSerialTimerCounterEnabled);
	CHECK(!e95SoftwareSerialTimerIrqEnabled);
	CHECK(e95SoftwareSerialTimerClockDisableCount == 1);
	CHECK(
		core_software_serial_hardware::software_serial_detail::activeReceivePin ==
		core_software_serial_hardware::software_serial_detail::NO_PIN);
	CHECK(!core_software_serial_hardware::isReceiving(RECEIVE_PIN));
}

int main() {
	scenarioReleasesTimerAfterStopListening();
	scenarioKeepsTheTimerOfAnotherListener();
	scenarioIgnoresCloseWithoutReceiveInitialization();
	scenarioStopsAndReleasesWhenOwnerCloses();

	if (failures == 0) {
		printf("software-serial-stm32-close: all scenarios passed\n");
		return 0;
	}
	printf("software-serial-stm32-close: %d check(s) failed\n", failures);
	return 1;
}
