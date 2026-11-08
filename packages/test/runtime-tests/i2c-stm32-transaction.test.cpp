// Host compile+behaviour guard for the generated STM32 I2C engine translation
// unit (stm32-bluepill/snapshots/engine/i2c/core_i2c.cpp). The real generated
// source is compiled against the host LL stand-ins, so the transaction state
// (address phase, data phase, NACK detection and the 32-byte capacity) is
// exercised on the same code the device builds. Only the platform LL headers
// and the GPIO pin table are host stand-ins.

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

static const uint8_t DEVICE_ADDRESS = 60;
static const uint8_t REGISTER_ADDRESS = 0;
static const uint8_t EXTRA_BYTE_COUNT = 1;

static void resetHardware() {
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
	for (uint16_t index = 0; index < 32; index++) {
		e95I2cTransmittedBytes[index] = 0;
	}
}

static core_i2c::I2CBus makeBus() {
	return core_i2c::I2CBus(
		I2C1,
		core_gpio::Pin::PIN_B7,
		core_gpio::Pin::PIN_B6);
}

static void scenarioWritesStepByStep() {
	resetHardware();
	const core_i2c::I2CBus bus = makeBus();

	bus.beginWrite(DEVICE_ADDRESS);
	bus.sendByte(REGISTER_ADDRESS);
	bus.sendByte(42);

	const core_i2c::I2CStatus status = bus.endWrite();
	CHECK(status == core_i2c::I2CStatus::OK);
	CHECK(e95I2cStartCount == 1);
	CHECK(e95I2cStopCount == 1);
	CHECK(e95I2cTransmittedAddress == (uint8_t)(DEVICE_ADDRESS << 1));
	CHECK(e95I2cTransmittedByteCount == 2);
	CHECK(e95I2cTransmittedBytes[0] == REGISTER_ADDRESS);
	CHECK(e95I2cTransmittedBytes[1] == 42);
}

static void scenarioReportsAddressNack() {
	resetHardware();
	const core_i2c::I2CBus bus = makeBus();
	e95I2cNackPhase = E95_I2C_NACK_ADDRESS;

	bus.beginWrite(DEVICE_ADDRESS);
	bus.sendByte(REGISTER_ADDRESS);

	CHECK(bus.endWrite() == core_i2c::I2CStatus::ADDRESS_NACK);
	CHECK(e95I2cStopCount == 1);
	CHECK(e95I2cTransmittedByteCount == 0);
}

static void scenarioReportsDataNack() {
	resetHardware();
	const core_i2c::I2CBus bus = makeBus();
	e95I2cNackPhase = E95_I2C_NACK_DATA;

	bus.beginWrite(DEVICE_ADDRESS);
	bus.sendByte(REGISTER_ADDRESS);
	bus.sendByte(42);

	CHECK(bus.endWrite() == core_i2c::I2CStatus::DATA_NACK);
	CHECK(e95I2cStopCount == 1);
}

static void scenarioCapsTransactionAtCapacity() {
	resetHardware();
	const core_i2c::I2CBus bus = makeBus();

	bus.beginWrite(DEVICE_ADDRESS);
	for (uint16_t index = 0; index < core_i2c::i2c_detail::TRANSACTION_CAPACITY + EXTRA_BYTE_COUNT; index++) {
		bus.sendByte((uint8_t)index);
	}

	CHECK(bus.endWrite() == core_i2c::I2CStatus::DATA_TOO_LONG);
	CHECK(e95I2cTransmittedByteCount == core_i2c::i2c_detail::TRANSACTION_CAPACITY);
}

static void scenarioTransactionCallsWithoutBeginAreNoOps() {
	resetHardware();
	const core_i2c::I2CBus bus = makeBus();

	bus.sendByte(REGISTER_ADDRESS);
	CHECK(e95I2cTransmittedByteCount == 0);
	CHECK(bus.endWrite() == core_i2c::I2CStatus::OTHER);
	CHECK(e95I2cStartCount == 0);
}

static void scenarioCloseDiscardsOpenTransaction() {
	resetHardware();
	const core_i2c::I2CBus bus = makeBus();

	bus.beginWrite(DEVICE_ADDRESS);
	bus.sendByte(REGISTER_ADDRESS);
	bus.close();
	bus.sendByte(EXTRA_BYTE_COUNT);

	CHECK(bus.endWrite() == core_i2c::I2CStatus::OTHER);
	CHECK(e95I2cStartCount == 0);
	CHECK(e95I2cTransmittedByteCount == 0);

	// close() also clears the queued length, so the next transaction starts
	// empty instead of replaying the discarded byte.
	bus.beginWrite(DEVICE_ADDRESS);
	bus.sendByte(42);
	CHECK(bus.endWrite() == core_i2c::I2CStatus::OK);
	CHECK(e95I2cTransmittedByteCount == 1);
	CHECK(e95I2cTransmittedBytes[0] == 42);
}

int main() {
	scenarioWritesStepByStep();
	scenarioReportsAddressNack();
	scenarioReportsDataNack();
	scenarioCapsTransactionAtCapacity();
	scenarioTransactionCallsWithoutBeginAreNoOps();
	scenarioCloseDiscardsOpenTransaction();

	if (failures == 0) {
		printf("I2C stm32 transaction: all scenarios passed\n");
		return 0;
	}
	printf("I2C stm32 transaction: %d check(s) failed\n", failures);
	return 1;
}
