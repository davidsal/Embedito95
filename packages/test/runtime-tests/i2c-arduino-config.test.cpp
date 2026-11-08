// Host compile+behaviour guard for the real arduino I2C header
// (strategies/arduino/i2c/i2c.h). The header is included verbatim against the
// AVR-like `TwoWire` stand-in (host/Wire.h), so a regression that maps the
// transaction state, the 32-byte capacity or the end-transmission result codes
// differently is caught here without hardware.

#include <stdint.h>
#include <stdio.h>

namespace core_i2c {
#include "packages/registry/src/strategies/shared/i2c/i2c_common.inc"
} // namespace core_i2c

#define _e95_replace_i2cCommon
#define _e95_replace_i2cSupport
#include "packages/registry/src/strategies/arduino/i2c/i2c.h"

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static const uint8_t DEVICE_ADDRESS = 60;
static const uint8_t REGISTER_ADDRESS = 0;
static const uint8_t EXTRA_BYTE_COUNT = 1;
static const uint8_t SLAVE_ADDRESS = 0x42;
static const uint8_t SLAVE_RESPONSE_BYTE = 0x11;

static core_i2c::I2CBus *slaveBus = nullptr;
static uint8_t receivedBytes[core_i2c::i2c_detail::RESPONSE_CAPACITY] = {};
static uint16_t receivedByteCount = 0;

static void onSlaveReceive() {
	receivedByteCount = 0;
	while (slaveBus->available() > 0 && receivedByteCount < core_i2c::i2c_detail::RESPONSE_CAPACITY) {
		receivedBytes[receivedByteCount] = slaveBus->read();
		receivedByteCount++;
	}
}

static void onSlaveRequest() {
	core_array::Array<u8> response;
	response.push(SLAVE_RESPONSE_BYTE);
	response.push(SLAVE_RESPONSE_BYTE);
	response.push(SLAVE_RESPONSE_BYTE);
	slaveBus->sendResponse(response);
}

static void onSlaveRequestOverflow() {
	core_array::Array<u8> response;
	for (uint16_t index = 0; index < core_i2c::i2c_detail::RESPONSE_CAPACITY + EXTRA_BYTE_COUNT; index++) {
		response.push((u8)index);
	}
	slaveBus->sendResponse(response);
}

static void resetBus() {
	Wire.reset();
}

static void resetSlaveObservations() {
	slaveBus = nullptr;
	receivedByteCount = 0;
	for (uint16_t index = 0; index < core_i2c::i2c_detail::RESPONSE_CAPACITY; index++) {
		receivedBytes[index] = 0;
	}
}

static void scenarioWritesStepByStep() {
	resetBus();
	core_i2c::I2CBus bus(Wire, 18, 19);

	bus.beginWrite(DEVICE_ADDRESS);
	CHECK(Wire.beginCount == 1);
	CHECK(Wire.lastAddress == DEVICE_ADDRESS);

	bus.sendByte(REGISTER_ADDRESS);
	bus.sendByte(42);
	CHECK(Wire.writeCount == 2);

	const core_i2c::I2CStatus status = bus.endWrite();
	CHECK(status == core_i2c::I2CStatus::OK);
	CHECK(Wire.transmissionCount == 1);
	CHECK(Wire.lastPayloadLength == 2);
	CHECK(Wire.lastPayload[0] == REGISTER_ADDRESS);
	CHECK(Wire.lastPayload[1] == 42);
}

static void scenarioKeepsConvenienceWrite() {
	resetBus();
	core_i2c::I2CBus bus(Wire, 18, 19);

	core_array::Array<u8> data;
	data.push(REGISTER_ADDRESS);
	data.push(7);
	data.push(8);
	bus.write(DEVICE_ADDRESS, data);

	CHECK(Wire.transmissionCount == 1);
	CHECK(Wire.lastAddress == DEVICE_ADDRESS);
	CHECK(Wire.lastPayloadLength == 3);
	CHECK(Wire.lastPayload[0] == REGISTER_ADDRESS);
	CHECK(Wire.lastPayload[1] == 7);
	CHECK(Wire.lastPayload[2] == 8);
}

static void scenarioCapsTransactionAtCapacity() {
	resetBus();
	core_i2c::I2CBus bus(Wire, 18, 19);

	bus.beginWrite(DEVICE_ADDRESS);
	for (uint16_t index = 0; index < core_i2c::i2c_detail::TRANSACTION_CAPACITY + EXTRA_BYTE_COUNT; index++) {
		bus.sendByte((u8)index);
	}

	CHECK(Wire.writeCount == core_i2c::i2c_detail::TRANSACTION_CAPACITY);
	const core_i2c::I2CStatus status = bus.endWrite();
	CHECK(status == core_i2c::I2CStatus::DATA_TOO_LONG);
	CHECK(Wire.lastPayloadLength == core_i2c::i2c_detail::TRANSACTION_CAPACITY);
}

static void scenarioMapsEndTransmissionStatus() {
	resetBus();
	core_i2c::I2CBus bus(Wire, 18, 19);

	Wire.nextStatus = 2;
	CHECK(
		bus.endWrite() == core_i2c::I2CStatus::OTHER);
	CHECK(Wire.transmissionCount == 0);

	bus.beginWrite(DEVICE_ADDRESS);
	Wire.nextStatus = 2;
	CHECK(bus.endWrite() == core_i2c::I2CStatus::ADDRESS_NACK);

	bus.beginWrite(DEVICE_ADDRESS);
	Wire.nextStatus = 3;
	CHECK(bus.endWrite() == core_i2c::I2CStatus::DATA_NACK);

	bus.beginWrite(DEVICE_ADDRESS);
	Wire.nextStatus = 1;
	CHECK(bus.endWrite() == core_i2c::I2CStatus::DATA_TOO_LONG);

	bus.beginWrite(DEVICE_ADDRESS);
	Wire.nextStatus = 4;
	CHECK(bus.endWrite() == core_i2c::I2CStatus::OTHER);

	bus.beginWrite(DEVICE_ADDRESS);
	Wire.nextStatus = 5;
	CHECK(bus.endWrite() == core_i2c::I2CStatus::OTHER);
}

static void scenarioSendByteWithoutBeginIsNoOp() {
	resetBus();
	core_i2c::I2CBus bus(Wire, 18, 19);

	bus.sendByte(9);
	CHECK(Wire.writeCount == 0);
	CHECK(Wire.transmissionCount == 0);
}

static void scenarioCloseReleasesBus() {
	resetBus();
	core_i2c::I2CBus bus(Wire, 18, 19);

	bus.close();
	bus.close();
	CHECK(Wire.endCount == 2);
}

static void scenarioCloseDiscardsOpenTransaction() {
	resetBus();
	core_i2c::I2CBus bus(Wire, 18, 19);

	bus.beginWrite(DEVICE_ADDRESS);
	bus.close();
	bus.sendByte(EXTRA_BYTE_COUNT);
	CHECK(bus.endWrite() == core_i2c::I2CStatus::OTHER);
	CHECK(Wire.transmissionCount == 0);
}

static void scenarioSlaveReceivesBytes() {
	resetBus();
	resetSlaveObservations();
	core_i2c::I2CBus bus(Wire, 18, 19);
	slaveBus = &bus;

	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	CHECK(Wire.slaveBeginCount == 1);
	CHECK(Wire.slaveAddress == SLAVE_ADDRESS);

	const uint8_t incoming[] = { 0x0A, 0x0B, 0x0C };
	Wire.simulateReceive(incoming, 3);

	CHECK(receivedByteCount == 3);
	CHECK(receivedBytes[0] == 0x0A);
	CHECK(receivedBytes[1] == 0x0B);
	CHECK(receivedBytes[2] == 0x0C);
}

static void scenarioSlaveRespondsToRequest() {
	resetBus();
	resetSlaveObservations();
	core_i2c::I2CBus bus(Wire, 18, 19);
	slaveBus = &bus;

	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onSlaveRequest);
	Wire.simulateRequest();

	CHECK(Wire.responseLength == 3);
	CHECK(Wire.responseWriteCount == 3);
	CHECK(Wire.responsePayload[0] == SLAVE_RESPONSE_BYTE);
	CHECK(Wire.responsePayload[1] == SLAVE_RESPONSE_BYTE);
	CHECK(Wire.responsePayload[2] == SLAVE_RESPONSE_BYTE);
}

static void scenarioSlaveTruncatesResponse() {
	resetBus();
	resetSlaveObservations();
	core_i2c::I2CBus bus(Wire, 18, 19);
	slaveBus = &bus;

	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onRequest(onSlaveRequestOverflow);
	Wire.simulateRequest();

	CHECK(Wire.responseLength == core_i2c::i2c_detail::RESPONSE_CAPACITY);
	CHECK(Wire.responseWriteCount == core_i2c::i2c_detail::RESPONSE_CAPACITY);
	CHECK(
		Wire.responsePayload[core_i2c::i2c_detail::RESPONSE_CAPACITY - 1] ==
		(uint8_t)(core_i2c::i2c_detail::RESPONSE_CAPACITY - 1));
}

static void scenarioSendResponseOutsideRequestIsNoOp() {
	resetBus();
	resetSlaveObservations();
	core_i2c::I2CBus bus(Wire, 18, 19);
	slaveBus = &bus;

	core_array::Array<u8> response;
	response.push(SLAVE_RESPONSE_BYTE);
	bus.initializeSlave(SLAVE_ADDRESS);
	bus.sendResponse(response);

	CHECK(Wire.responseLength == 0);
	CHECK(Wire.responseWriteCount == 0);
}

static void scenarioCloseClearsSlaveHandlers() {
	resetBus();
	resetSlaveObservations();
	core_i2c::I2CBus bus(Wire, 18, 19);
	slaveBus = &bus;

	bus.initializeSlave(SLAVE_ADDRESS);
	bus.onReceive(onSlaveReceive);
	bus.onRequest(onSlaveRequest);
	bus.close();

	const uint8_t incoming[] = { 0x01 };
	Wire.simulateReceive(incoming, 1);
	Wire.simulateRequest();

	CHECK(receivedByteCount == 0);
	CHECK(Wire.responseLength == 0);
}

int main() {
	scenarioWritesStepByStep();
	scenarioKeepsConvenienceWrite();
	scenarioCapsTransactionAtCapacity();
	scenarioMapsEndTransmissionStatus();
	scenarioSendByteWithoutBeginIsNoOp();
	scenarioCloseReleasesBus();
	scenarioCloseDiscardsOpenTransaction();
	scenarioSlaveReceivesBytes();
	scenarioSlaveRespondsToRequest();
	scenarioSlaveTruncatesResponse();
	scenarioSendResponseOutsideRequestIsNoOp();
	scenarioCloseClearsSlaveHandlers();

	if (failures == 0) {
		printf("I2C arduino config: all scenarios passed\n");
		return 0;
	}
	printf("I2C arduino config: %d check(s) failed\n", failures);
	return 1;
}
