// Host compile+behaviour guard for the generated STM32 I2C slave state machine
// (stm32-bluepill/snapshots/engine/i2c/core_i2c.cpp). The real generated source
// is compiled against the host LL stand-ins, and the event/error vectors are
// driven directly: address match (receiver and transmitter), byte reception,
// byte transmission, overflow, stop detection, error flags, bus hand-over and
// close. Only the platform LL headers and the GPIO pin table are stand-ins.

#include "packages/test/src/stm32-bluepill/snapshots/engine/i2c/core_i2c.cpp"

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

namespace core_gpio {

const _e95_PinInfo _e95_PINS[36] = {};

void _e95_setPinAlternate(Pin pin) {
	(void)pin;
}

} // namespace core_gpio

static const uint8_t SLAVE_ADDRESS = 0x42;
static const uint8_t INVALID_SLAVE_ADDRESS = 0x80;
static const uint8_t RESPONSE_FIRST_BYTE = 0x11;
static const uint8_t RESPONSE_SECOND_BYTE = 0x22;
static const uint8_t EXTRA_BYTE_COUNT = 1;
static const uint8_t FILLER_BYTE = 0xFF;
static const uint8_t LARGE_RESPONSE_LENGTH = 40;

static core_i2c::I2CBus *slaveBus = nullptr;
static uint8_t receivedBytes[core_i2c::i2c_detail::TRANSACTION_CAPACITY] = {};
static uint16_t receivedByteCount = 0;
static uint16_t receiveHandlerCount = 0;
static uint16_t requestHandlerCount = 0;
static uint16_t firstBusHandlerCount = 0;
static uint16_t secondBusHandlerCount = 0;

static void collectReceivedBytes() {
	receiveHandlerCount++;
	receivedByteCount = 0;
	while (
		slaveBus->available() > 0 &&
		receivedByteCount < core_i2c::i2c_detail::TRANSACTION_CAPACITY) {
		receivedBytes[receivedByteCount] = slaveBus->read();
		receivedByteCount++;
	}
}

static void onSlaveReceive() {
	collectReceivedBytes();
}

static void onSlaveRequest() {
	requestHandlerCount++;
	core_array::Array<u8> response;
	response.push(RESPONSE_FIRST_BYTE);
	response.push(RESPONSE_SECOND_BYTE);
	slaveBus->sendResponse(response);
}

static void onEmptyRequest() {
	requestHandlerCount++;
}

static void onLargeRequest() {
	requestHandlerCount++;
	core_array::Array<u8> response;
	for (uint8_t index = 0; index < LARGE_RESPONSE_LENGTH; index++) {
		response.push(index);
	}
	slaveBus->sendResponse(response);
}

static void onFirstBusReceive() {
	firstBusHandlerCount++;
}

static void onSecondBusReceive() {
	secondBusHandlerCount++;
}

static void resetHardware() {
	core_i2c::i2c_detail::clearActiveSlave();
	e95I2c1Registers = I2C_TypeDef();
	e95I2c2Registers = I2C_TypeDef();
	e95I2cNackPhase = E95_I2C_NACK_NONE;
	e95I2cPhase = E95_I2C_PHASE_IDLE;
	e95I2cStartCount = 0;
	e95I2cStopCount = 0;
	e95I2cEnableCount = 0;
	e95I2cDisableCount = 0;
	e95I2cTransmittedAddress = 0;
	e95I2cTransmittedByteCount = 0;
	for (
		uint16_t index = 0;
		index < E95_I2C_HOST_TRANSMIT_CAPACITY;
		index++) {
		e95I2cTransmittedBytes[index] = 0;
	}
	e95I2cSlaveMode = false;
	e95I2cSlaveSr1 = 0;
	e95I2cSlaveSr2 = 0;
	e95I2cSlaveReceivedByte = 0;
	e95I2cSlaveTransmittedByteCount = 0;
	for (
		uint16_t index = 0;
		index < E95_I2C_HOST_TRANSMIT_CAPACITY;
		index++) {
		e95I2cSlaveTransmittedBytes[index] = 0;
	}
	e95I2cOwnAddress1 = 0;
	e95I2cOwnAddressMode = 0;
	e95I2cLastAcknowledge = 0;
	e95I2cAcknowledgeCount = 0;
	e95I2cNegativeAcknowledgeCount = 0;
	e95I2cEventInterruptsEnabled = false;
	e95I2cBufferInterruptsEnabled = false;
	e95I2cErrorInterruptsEnabled = false;
	e95I2cEnabledEventIrqCount = 0;
	e95I2cEnabledErrorIrqCount = 0;
	e95I2cDisabledEventIrqCount = 0;
	e95I2cDisabledErrorIrqCount = 0;
	slaveBus = nullptr;
	receivedByteCount = 0;
	receiveHandlerCount = 0;
	requestHandlerCount = 0;
	firstBusHandlerCount = 0;
	secondBusHandlerCount = 0;
	for (uint16_t index = 0; index < core_i2c::i2c_detail::TRANSACTION_CAPACITY; index++) {
		receivedBytes[index] = 0;
	}
}

static core_i2c::I2CBus makeFirstBus() {
	return core_i2c::I2CBus(
		I2C1,
		core_gpio::Pin::PIN_B7,
		core_gpio::Pin::PIN_B6);
}

static core_i2c::I2CBus makeSecondBus() {
	return core_i2c::I2CBus(
		I2C2,
		core_gpio::Pin::PIN_B11,
		core_gpio::Pin::PIN_B10);
}

static void startSlaveHardware() {
	e95I2cSlaveMode = true;
	e95I2cSlaveSr1 = 0;
	e95I2cSlaveSr2 = 0;
}

static void raiseAddressMatch(bool slaveTransmits) {
	e95I2cSlaveSr1 |= E95_I2C_SR1_ADDR;
	e95I2cSlaveSr2 =
		slaveTransmits ? E95_I2C_SR2_TRA : LL_I2C_DIRECTION_READ;
}

static void raiseReceivedByte(uint8_t value) {
	e95I2cSlaveReceivedByte = value;
	e95I2cSlaveSr1 |= E95_I2C_SR1_RXNE;
}

static void raiseTransmitReady() {
	e95I2cSlaveSr1 |= E95_I2C_SR1_TXE;
}

static void raiseStop() {
	e95I2cSlaveSr1 |= E95_I2C_SR1_STOPF;
}

static void scenarioInitializesSlaveAddress() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();

	bus.initializeSlave(SLAVE_ADDRESS);

	CHECK(e95I2cOwnAddress1 == SLAVE_ADDRESS);
	CHECK(e95I2cOwnAddressMode == LL_I2C_OWNADDRESS1_7BIT);
	CHECK(e95I2cLastAcknowledge == LL_I2C_ACK);
	CHECK(e95I2cEventInterruptsEnabled);
	CHECK(e95I2cBufferInterruptsEnabled);
	CHECK(e95I2cErrorInterruptsEnabled);
	CHECK(e95I2cEnabledEventIrqCount == 1);
	CHECK(e95I2cEnabledErrorIrqCount == 1);
}

static void scenarioRejectsAddressAboveSevenBits() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();

	bus.initializeSlave(INVALID_SLAVE_ADDRESS);

	CHECK(e95I2cOwnAddress1 == 0);
	CHECK(e95I2cEnableCount == 0);
	CHECK(e95I2cEnabledEventIrqCount == 0);
	CHECK(e95I2cEnabledErrorIrqCount == 0);
}

static void scenarioReceivesMasterWrite() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	startSlaveHardware();

	raiseAddressMatch(false);
	I2C1_EV_IRQHandler();
	CHECK(e95I2cLastAcknowledge == LL_I2C_ACK);
	CHECK((e95I2cSlaveSr1 & E95_I2C_SR1_ADDR) == 0);

	raiseReceivedByte(0x0A);
	I2C1_EV_IRQHandler();
	raiseReceivedByte(0x0B);
	I2C1_EV_IRQHandler();
	raiseReceivedByte(0x0C);
	I2C1_EV_IRQHandler();

	raiseStop();
	I2C1_EV_IRQHandler();

	CHECK(receiveHandlerCount == 1);
	CHECK(receivedByteCount == 3);
	CHECK(receivedBytes[0] == 0x0A);
	CHECK(receivedBytes[1] == 0x0B);
	CHECK(receivedBytes[2] == 0x0C);
}

static void scenarioDrainsByteWhenStopArrivesTogether() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	startSlaveHardware();

	raiseAddressMatch(false);
	I2C1_EV_IRQHandler();

	raiseReceivedByte(0x0A);
	I2C1_EV_IRQHandler();

	raiseReceivedByte(0x0B);
	raiseStop();
	I2C1_EV_IRQHandler();

	CHECK(receiveHandlerCount == 1);
	CHECK(receivedByteCount == 2);
	CHECK(receivedBytes[0] == 0x0A);
	CHECK(receivedBytes[1] == 0x0B);
}

static void scenarioDiscardsReceiveOverflow() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	startSlaveHardware();

	raiseAddressMatch(false);
	I2C1_EV_IRQHandler();
	for (
		uint16_t index = 0;
		index < core_i2c::i2c_detail::TRANSACTION_CAPACITY + EXTRA_BYTE_COUNT;
		index++) {
		raiseReceivedByte((uint8_t)index);
		I2C1_EV_IRQHandler();
	}
	raiseStop();
	I2C1_EV_IRQHandler();

	CHECK(receivedByteCount == core_i2c::i2c_detail::TRANSACTION_CAPACITY);
	CHECK(
		receivedBytes[core_i2c::i2c_detail::TRANSACTION_CAPACITY - 1] ==
		(uint8_t)(core_i2c::i2c_detail::TRANSACTION_CAPACITY - 1));
}

static void scenarioRespondsToMasterRead() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onSlaveRequest);
	startSlaveHardware();

	raiseAddressMatch(true);
	I2C1_EV_IRQHandler();
	CHECK(requestHandlerCount == 1);

	raiseTransmitReady();
	I2C1_EV_IRQHandler();
	CHECK(e95I2cSlaveTransmittedByteCount == 1);
	CHECK(e95I2cSlaveTransmittedBytes[0] == RESPONSE_FIRST_BYTE);

	raiseTransmitReady();
	I2C1_EV_IRQHandler();
	CHECK(e95I2cSlaveTransmittedByteCount == 2);
	CHECK(e95I2cSlaveTransmittedBytes[1] == RESPONSE_SECOND_BYTE);

	raiseTransmitReady();
	I2C1_EV_IRQHandler();
	CHECK(e95I2cSlaveTransmittedByteCount == 3);
	CHECK(e95I2cSlaveTransmittedBytes[2] == FILLER_BYTE);
	CHECK(e95I2cNegativeAcknowledgeCount == 0);
	CHECK(e95I2cLastAcknowledge == LL_I2C_ACK);

	raiseStop();
	I2C1_EV_IRQHandler();
	CHECK(requestHandlerCount == 1);
}

static void scenarioEmptyResponseSendsFillerByte() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onEmptyRequest);
	startSlaveHardware();

	raiseAddressMatch(true);
	I2C1_EV_IRQHandler();

	CHECK(requestHandlerCount == 1);
	CHECK(e95I2cLastAcknowledge == LL_I2C_ACK);

	raiseTransmitReady();
	I2C1_EV_IRQHandler();

	CHECK(e95I2cNegativeAcknowledgeCount == 0);
	CHECK(e95I2cSlaveTransmittedByteCount == 1);
	CHECK(e95I2cSlaveTransmittedBytes[0] == FILLER_BYTE);
	CHECK(e95I2cLastAcknowledge == LL_I2C_ACK);
}

static void scenarioTruncatesResponseToCapacity() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onLargeRequest);
	startSlaveHardware();

	raiseAddressMatch(true);
	I2C1_EV_IRQHandler();

	const uint8_t transmittedCapacity =
		core_i2c::i2c_detail::RESPONSE_CAPACITY + EXTRA_BYTE_COUNT;
	for (uint8_t index = 0; index < transmittedCapacity; index++) {
		raiseTransmitReady();
		I2C1_EV_IRQHandler();
	}

	CHECK(e95I2cSlaveTransmittedByteCount == transmittedCapacity);
	for (
		uint8_t index = 0;
		index < core_i2c::i2c_detail::RESPONSE_CAPACITY;
		index++) {
		CHECK(e95I2cSlaveTransmittedBytes[index] == index);
	}
	CHECK(
		e95I2cSlaveTransmittedBytes[core_i2c::i2c_detail::RESPONSE_CAPACITY] ==
		FILLER_BYTE);
}

static void scenarioTransmitEndsOnMasterNack() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onSlaveRequest);
	bus.onReceive(onSlaveReceive);
	startSlaveHardware();

	raiseAddressMatch(true);
	I2C1_EV_IRQHandler();
	raiseTransmitReady();
	I2C1_EV_IRQHandler();
	raiseTransmitReady();
	I2C1_EV_IRQHandler();

	CHECK(e95I2cSlaveTransmittedByteCount == 2);
	CHECK(requestHandlerCount == 1);

	e95I2cSlaveSr1 |= E95_I2C_SR1_AF;
	I2C1_ER_IRQHandler();

	CHECK((e95I2cSlaveSr1 & E95_I2C_SR1_AF) == 0);
	CHECK(!e95I2cBufferInterruptsEnabled);
	CHECK(receiveHandlerCount == 0);

	// The stop arrives with the latched flags still untouched: the reception
	// flag must keep the spurious onReceive from firing after the transmit NACK.
	raiseStop();
	I2C1_EV_IRQHandler();

	CHECK(receiveHandlerCount == 0);
	CHECK((e95I2cSlaveSr1 & E95_I2C_SR1_STOPF) == 0);

	e95I2cSlaveTransmittedByteCount = 0;
	raiseAddressMatch(true);
	I2C1_EV_IRQHandler();

	CHECK(requestHandlerCount == 2);
	CHECK(e95I2cLastAcknowledge == LL_I2C_ACK);
	CHECK(receiveHandlerCount == 0);

	raiseTransmitReady();
	I2C1_EV_IRQHandler();

	CHECK(e95I2cSlaveTransmittedByteCount == 1);
	CHECK(e95I2cSlaveTransmittedBytes[0] == RESPONSE_FIRST_BYTE);
	CHECK(receiveHandlerCount == 0);
}

static void scenarioIgnoresTransmitReadyDuringReceive() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	startSlaveHardware();

	raiseAddressMatch(false);
	I2C1_EV_IRQHandler();

	raiseTransmitReady();
	I2C1_EV_IRQHandler();

	CHECK(e95I2cSlaveTransmittedByteCount == 0);

	raiseReceivedByte(0x0A);
	raiseStop();
	I2C1_EV_IRQHandler();

	CHECK(receiveHandlerCount == 1);
	CHECK(receivedByteCount == 1);
	CHECK(receivedBytes[0] == 0x0A);
	CHECK(e95I2cSlaveTransmittedByteCount == 0);
}

static void scenarioIgnoresTransmitReadyAfterMasterNack() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onSlaveRequest);
	bus.onReceive(onSlaveReceive);
	startSlaveHardware();

	raiseAddressMatch(true);
	I2C1_EV_IRQHandler();
	raiseTransmitReady();
	I2C1_EV_IRQHandler();

	CHECK(e95I2cSlaveTransmittedByteCount == 1);

	e95I2cSlaveSr1 |= E95_I2C_SR1_AF;
	I2C1_ER_IRQHandler();
	raiseTransmitReady();
	I2C1_EV_IRQHandler();

	CHECK(e95I2cSlaveTransmittedByteCount == 1);

	raiseStop();
	I2C1_EV_IRQHandler();

	CHECK(receiveHandlerCount == 0);
	CHECK(e95I2cSlaveTransmittedByteCount == 1);
}

static void scenarioSendResponseOutsideRequestIsNoOp() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onSlaveRequest);
	startSlaveHardware();

	raiseAddressMatch(true);
	I2C1_EV_IRQHandler();

	core_array::Array<u8> extraResponse;
	extraResponse.push(RESPONSE_SECOND_BYTE);
	bus.sendResponse(extraResponse);

	raiseTransmitReady();
	I2C1_EV_IRQHandler();
	raiseTransmitReady();
	I2C1_EV_IRQHandler();

	CHECK(e95I2cSlaveTransmittedByteCount == 2);
	CHECK(e95I2cSlaveTransmittedBytes[0] == RESPONSE_FIRST_BYTE);
	CHECK(e95I2cSlaveTransmittedBytes[1] == RESPONSE_SECOND_BYTE);
}

static void scenarioClearsErrorFlags() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	startSlaveHardware();

	raiseAddressMatch(false);
	I2C1_EV_IRQHandler();
	e95I2cSlaveSr1 |= E95_I2C_SR1_AF | E95_I2C_SR1_BERR | E95_I2C_SR1_OVR;

	I2C1_ER_IRQHandler();

	CHECK((e95I2cSlaveSr1 & E95_I2C_SR1_AF) == 0);
	CHECK((e95I2cSlaveSr1 & E95_I2C_SR1_BERR) == 0);
	CHECK((e95I2cSlaveSr1 & E95_I2C_SR1_OVR) == 0);
	CHECK(!e95I2cBufferInterruptsEnabled);
}

static void scenarioCloseDisablesSlave() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();
	slaveBus = &bus;
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	bus.close();

	CHECK(!e95I2cEventInterruptsEnabled);
	CHECK(!e95I2cBufferInterruptsEnabled);
	CHECK(!e95I2cErrorInterruptsEnabled);
	CHECK(e95I2cDisabledEventIrqCount == 1);
	CHECK(e95I2cDisabledErrorIrqCount == 1);

	startSlaveHardware();
	raiseAddressMatch(false);
	I2C1_EV_IRQHandler();
	raiseReceivedByte(0x01);
	I2C1_EV_IRQHandler();
	raiseStop();
	I2C1_EV_IRQHandler();

	CHECK(receiveHandlerCount == 0);
}

static void scenarioOnlyOneBusListens() {
	resetHardware();
	core_i2c::I2CBus firstBus = makeFirstBus();
	core_i2c::I2CBus secondBus = makeSecondBus();
	slaveBus = &secondBus;
	firstBus.initializeSlave(SLAVE_ADDRESS);
	firstBus.onReceive(onFirstBusReceive);
	secondBus.initializeSlave(SLAVE_ADDRESS);
	secondBus.onReceive(onSecondBusReceive);
	startSlaveHardware();

	CHECK(e95I2cDisabledEventIrqCount == 1);
	CHECK(e95I2cDisabledErrorIrqCount == 1);
	CHECK(e95I2cEnabledEventIrqCount == 2);
	CHECK(e95I2cEnabledErrorIrqCount == 2);
	// The handed-over bus is disabled at the peripheral level, not only in the
	// NVIC: the first initializeSlave disables it once and the second does the
	// same plus the hand-over release.
	CHECK(e95I2cDisableCount == 3);

	raiseAddressMatch(false);
	I2C1_EV_IRQHandler();
	raiseStop();
	I2C1_EV_IRQHandler();
	CHECK(firstBusHandlerCount == 0);

	e95I2cSlaveSr1 = 0;
	raiseAddressMatch(false);
	I2C2_EV_IRQHandler();
	raiseReceivedByte(0x05);
	I2C2_EV_IRQHandler();
	raiseStop();
	I2C2_EV_IRQHandler();
	CHECK(secondBusHandlerCount == 1);
}

static void scenarioMasterTransactionStillWorks() {
	resetHardware();
	core_i2c::I2CBus bus = makeFirstBus();

	bus.beginWrite(60);
	bus.sendByte(0);
	bus.sendByte(42);

	CHECK(bus.endWrite() == core_i2c::I2CStatus::OK);
	CHECK(e95I2cTransmittedAddress == (uint8_t)(60 << 1));
	CHECK(e95I2cTransmittedByteCount == 2);
	CHECK(e95I2cTransmittedBytes[1] == 42);
}

int main() {
	scenarioInitializesSlaveAddress();
	scenarioRejectsAddressAboveSevenBits();
	scenarioReceivesMasterWrite();
	scenarioDrainsByteWhenStopArrivesTogether();
	scenarioDiscardsReceiveOverflow();
	scenarioRespondsToMasterRead();
	scenarioEmptyResponseSendsFillerByte();
	scenarioTruncatesResponseToCapacity();
	scenarioTransmitEndsOnMasterNack();
	scenarioIgnoresTransmitReadyDuringReceive();
	scenarioIgnoresTransmitReadyAfterMasterNack();
	scenarioSendResponseOutsideRequestIsNoOp();
	scenarioClearsErrorFlags();
	scenarioCloseDisablesSlave();
	scenarioOnlyOneBusListens();
	scenarioMasterTransactionStillWorks();

	if (failures == 0) {
		printf("I2C stm32 slave: all scenarios passed\n");
		return 0;
	}
	printf("I2C stm32 slave: %d check(s) failed\n", failures);
	return 1;
}
