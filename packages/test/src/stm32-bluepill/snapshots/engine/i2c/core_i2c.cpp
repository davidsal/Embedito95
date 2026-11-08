#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_i2c.h"
#include "core_i2c.h"
#include "../gpio/core_gpio.h"

namespace core_i2c {

static const u32 I2C_STANDARD_CLOCK = 100000;
static const u32 I2C_FAST_CLOCK = 400000;
static const u32 I2C_STANDARD_MODE_DIVISOR = 2;
static const u32 I2C_FAST_MODE_DIVISOR = 3;
static const u32 I2C_FAST_RISE_NANOS = 300;
static const u32 I2C_NANOS_PER_MICRO = 1000;
static const u32 I2C_HZ_PER_MHZ = 1000000;
static const u32 I2C_APB1_CLOCK = 36000000;
static const u8 I2C_WRITE_BIT = 0;
static const u8 I2C_READ_BIT = 1;
static const u8 I2C_ADDRESS_SHIFT = 1;
static const u8 I2C_EMPTY_BYTE = 0;
// Defined filler byte the slave keeps sending once the response is exhausted,
// so a master read never stalls waiting for data.
static const u8 I2C_TX_FILLER_BYTE = 0xFF;
static const u8 I2C_LAST_BYTE_OFFSET = 1;
static const u8 I2C_MAX_SLAVE_ADDRESS = 0x7F;

typedef struct {
	I2C_TypeDef *i2c;
	u32 clockEnable;
	IRQn_Type eventInterrupt;
	IRQn_Type errorInterrupt;
} I2CConfig;

static const I2CConfig I2C_CONFIGS[] = {
	{
		I2C1,
		LL_APB1_GRP1_PERIPH_I2C1,
		I2C1_EV_IRQn,
		I2C1_ER_IRQn,
	},
	{
		I2C2,
		LL_APB1_GRP1_PERIPH_I2C2,
		I2C2_EV_IRQn,
		I2C2_ER_IRQn,
	},
};

static const I2CConfig *findI2CConfig(I2C_TypeDef *i2c) {
	for (const I2CConfig &config : I2C_CONFIGS) {
		if (config.i2c == i2c) {
			return &config;
		}
	}
	return nullptr;
}

namespace i2c_detail {

// The interrupt vector receives no bus argument, and only one bus can listen
// as a slave at a time, so the most recently configured bus owns the dispatch.
static I2CBusBody *activeSlaveBody = nullptr;
// The handle is kept beside the body so a newly configured bus can release the
// previous one without dereferencing its body after it goes out of scope.
static I2C_TypeDef *activeSlaveHandle = nullptr;

static void setActiveSlave(I2CBusBody *body) {
	activeSlaveBody = body;
	activeSlaveHandle = body->handle;
}

static void clearActiveSlave() {
	activeSlaveBody = nullptr;
	activeSlaveHandle = nullptr;
}

static void resetSlaveTransaction(I2CBusBody *body) {
	body->responseLength = 0;
	body->responseIndex = 0;
	body->requestActive = false;
	body->slaveTransmitter = false;
}

static I2CBusBody *findActiveSlave(I2C_TypeDef *handle) {
	if (activeSlaveBody == nullptr || activeSlaveHandle != handle) {
		return nullptr;
	}
	return activeSlaveBody;
}

static void disableSlaveInterrupts(I2C_TypeDef *handle) {
	const I2CConfig *config = findI2CConfig(handle);
	LL_I2C_DisableIT_EVT(handle);
	LL_I2C_DisableIT_BUF(handle);
	LL_I2C_DisableIT_ERR(handle);
	if (config != nullptr) {
		NVIC_DisableIRQ(config->eventInterrupt);
		NVIC_DisableIRQ(config->errorInterrupt);
	}
}

// Releases the peripheral as well as the interrupts so a bus that is handed
// over stops acknowledging its own address instead of only going quiet.
static void stopSlavePeripheral(I2C_TypeDef *handle) {
	disableSlaveInterrupts(handle);
	LL_I2C_Disable(handle);
}

static void handleSlaveAddress(I2CBusBody *body) {
	I2C_TypeDef *handle = body->handle;
	const bool slaveTransmits =
		LL_I2C_GetTransferDirection(handle) == LL_I2C_DIRECTION_WRITE;

	LL_I2C_ClearFlag_ADDR(handle);
	LL_I2C_AcknowledgeNextData(handle, LL_I2C_ACK);

	if (slaveTransmits) {
		body->slaveTransmitter = true;
		body->receiveActive = false;
		body->responseLength = 0;
		body->responseIndex = 0;
		body->requestActive = true;
		if (body->requestHandler != nullptr) {
			body->requestHandler();
		}
		body->requestActive = false;
		LL_I2C_EnableIT_TX(handle);
		return;
	}

	body->slaveTransmitter = false;
	body->receiveActive = true;
	body->readBuffer.truncate(I2C_EMPTY_BYTE);
	body->readIndex = 0;
	body->readBuffer.reserve(i2c_detail::TRANSACTION_CAPACITY);
	LL_I2C_EnableIT_BUF(handle);
}

static void handleSlaveReceiveByte(I2CBusBody *body) {
	const u8 value = LL_I2C_ReceiveData8(body->handle);
	if (body->readBuffer.length() < i2c_detail::TRANSACTION_CAPACITY) {
		body->readBuffer.push(value);
	}
}

// The master owns the read length, so the slave cannot end the transfer with
// its own NACK: clearing ACK here would NACK the next address and leaving DR
// unwritten would stall the clock. Keep ACK asserted and feed a defined filler
// once the response runs out, until the master NACKs or generates the stop.
static void handleSlaveTransmitByte(I2CBusBody *body) {
	if (!body->slaveTransmitter) {
		return;
	}
	if (body->responseIndex < body->responseLength) {
		LL_I2C_TransmitData8(
			body->handle,
			body->responseBuffer[body->responseIndex]);
		body->responseIndex = body->responseIndex + 1;
		return;
	}
	LL_I2C_TransmitData8(body->handle, I2C_TX_FILLER_BYTE);
}

static void handleSlaveStop(I2CBusBody *body) {
	LL_I2C_ClearFlag_STOP(body->handle);
	const bool wasReceiving = body->receiveActive;
	body->receiveActive = false;
	resetSlaveTransaction(body);
	if (wasReceiving && body->receiveHandler != nullptr) {
		body->receiveHandler();
	}
}

void handleEventInterrupt(I2C_TypeDef *handle) {
	I2CBusBody *body = findActiveSlave(handle);
	if (body == nullptr) {
		return;
	}
	// A byte can still be latched in DR when the stop arrives, so drain the data
	// registers before resetting the transaction on STOPF.
	if (LL_I2C_IsActiveFlag_ADDR(handle)) {
		handleSlaveAddress(body);
	}
	if (LL_I2C_IsActiveFlag_RXNE(handle)) {
		handleSlaveReceiveByte(body);
	}
	if (LL_I2C_IsActiveFlag_TXE(handle)) {
		handleSlaveTransmitByte(body);
	}
	if (LL_I2C_IsActiveFlag_STOP(handle)) {
		handleSlaveStop(body);
	}
}

void handleErrorInterrupt(I2C_TypeDef *handle) {
	if (LL_I2C_IsActiveFlag_BERR(handle)) {
		LL_I2C_ClearFlag_BERR(handle);
	}
	if (LL_I2C_IsActiveFlag_ARLO(handle)) {
		LL_I2C_ClearFlag_ARLO(handle);
	}
	if (LL_I2C_IsActiveFlag_OVR(handle)) {
		LL_I2C_ClearFlag_OVR(handle);
	}
	if (LL_I2C_IsActiveFlag_AF(handle)) {
		LL_I2C_ClearFlag_AF(handle);
	}
	LL_I2C_DisableIT_BUF(handle);
	I2CBusBody *body = findActiveSlave(handle);
	if (body != nullptr) {
		resetSlaveTransaction(body);
	}
}

} // namespace i2c_detail

void I2CBus::initialize() const {
	const I2CConfig *config = findI2CConfig(body_->handle);
	if (!config) {
		return;
	}

	LL_APB1_GRP1_EnableClock(config->clockEnable);

	core_gpio::_e95_setPinAlternate(body_->sda);
	core_gpio::_e95_setPinAlternate(body_->scl);
	LL_GPIO_SetPinOutputType(
		core_gpio::_e95_pinPort(body_->sda),
		core_gpio::_e95_pinMask(body_->sda),
		LL_GPIO_OUTPUT_OPENDRAIN);
	LL_GPIO_SetPinOutputType(
		core_gpio::_e95_pinPort(body_->scl),
		core_gpio::_e95_pinMask(body_->scl),
		LL_GPIO_OUTPUT_OPENDRAIN);
	LL_GPIO_SetPinPull(
		core_gpio::_e95_pinPort(body_->sda),
		core_gpio::_e95_pinMask(body_->sda),
		LL_GPIO_PULL_UP);
	LL_GPIO_SetPinPull(
		core_gpio::_e95_pinPort(body_->scl),
		core_gpio::_e95_pinMask(body_->scl),
		LL_GPIO_PULL_UP);

	LL_I2C_SetPeriphClock(body_->handle, I2C_APB1_CLOCK);
	LL_I2C_SetMode(body_->handle, LL_I2C_MODE_I2C);
	LL_I2C_SetClockSpeedMode(body_->handle, LL_I2C_CLOCK_SPEED_STANDARD_MODE);
	LL_I2C_SetDutyCycle(body_->handle, LL_I2C_DUTYCYCLE_2);
	LL_I2C_SetClockPeriod(body_->handle, I2C_APB1_CLOCK / (I2C_STANDARD_CLOCK * I2C_STANDARD_MODE_DIVISOR));
	LL_I2C_SetRiseTime(body_->handle, I2C_APB1_CLOCK / I2C_HZ_PER_MHZ + 1);
	LL_I2C_SetOwnAddress1(body_->handle, 0, LL_I2C_OWNADDRESS1_7BIT);
	LL_I2C_SetOwnAddress2(body_->handle, 0);
	LL_I2C_DisableGeneralCall(body_->handle);
	LL_I2C_Enable(body_->handle);
}

void I2CBus::setClock(u32 frequency) const {
	LL_I2C_Disable(body_->handle);

	if (frequency >= I2C_FAST_CLOCK) {
		LL_I2C_SetClockSpeedMode(body_->handle, LL_I2C_CLOCK_SPEED_FAST_MODE);
		LL_I2C_SetDutyCycle(body_->handle, LL_I2C_DUTYCYCLE_2);
		LL_I2C_SetClockPeriod(
			body_->handle,
			I2C_APB1_CLOCK / (frequency * I2C_FAST_MODE_DIVISOR));
		LL_I2C_SetRiseTime(
			body_->handle,
			((I2C_APB1_CLOCK / I2C_HZ_PER_MHZ) * I2C_FAST_RISE_NANOS) /
					I2C_NANOS_PER_MICRO +
				1);
	} else {
		LL_I2C_SetClockSpeedMode(body_->handle, LL_I2C_CLOCK_SPEED_STANDARD_MODE);
		LL_I2C_SetDutyCycle(body_->handle, LL_I2C_DUTYCYCLE_2);
		LL_I2C_SetClockPeriod(
			body_->handle,
			I2C_APB1_CLOCK / (frequency * I2C_STANDARD_MODE_DIVISOR));
		LL_I2C_SetRiseTime(body_->handle, I2C_APB1_CLOCK / I2C_HZ_PER_MHZ + 1);
	}

	LL_I2C_Enable(body_->handle);
}

// Sends the address and payload as one transaction, watching the
// acknowledge-failure flag in both phases so a missing device surfaces as an
// address NACK and a rejected payload as a data NACK. Every failure path clears
// the flag and releases the bus with a stop condition.
static I2CStatus transmitTransaction(
	I2C_TypeDef *handle,
	u8 address,
	const u8 *data,
	u8 length) {
	while (LL_I2C_IsActiveFlag_BUSY(handle));
	LL_I2C_GenerateStartCondition(handle);
	while (!LL_I2C_IsActiveFlag_SB(handle));
	LL_I2C_TransmitData8(handle, (u8)((address << I2C_ADDRESS_SHIFT) | I2C_WRITE_BIT));
	while (!LL_I2C_IsActiveFlag_ADDR(handle) && !LL_I2C_IsActiveFlag_AF(handle));
	if (LL_I2C_IsActiveFlag_AF(handle)) {
		LL_I2C_ClearFlag_AF(handle);
		LL_I2C_GenerateStopCondition(handle);
		return I2CStatus::ADDRESS_NACK;
	}
	LL_I2C_ClearFlag_ADDR(handle);
	for (u8 index = 0; index < length; index++) {
		while (!LL_I2C_IsActiveFlag_TXE(handle) && !LL_I2C_IsActiveFlag_AF(handle));
		if (LL_I2C_IsActiveFlag_AF(handle)) {
			LL_I2C_ClearFlag_AF(handle);
			LL_I2C_GenerateStopCondition(handle);
			return I2CStatus::DATA_NACK;
		}
		LL_I2C_TransmitData8(handle, data[index]);
	}
	while (!LL_I2C_IsActiveFlag_BTF(handle) && !LL_I2C_IsActiveFlag_AF(handle));
	if (LL_I2C_IsActiveFlag_AF(handle)) {
		LL_I2C_ClearFlag_AF(handle);
		LL_I2C_GenerateStopCondition(handle);
		return I2CStatus::DATA_NACK;
	}
	LL_I2C_GenerateStopCondition(handle);
	return I2CStatus::OK;
}

void I2CBus::close() const {
	body_->writeActive = false;
	body_->writeLength = 0;
	body_->writeOverflowed = false;
	body_->receiveHandler = nullptr;
	body_->requestHandler = nullptr;
	body_->receiveActive = false;
	i2c_detail::resetSlaveTransaction(body_.pointer());
	if (i2c_detail::activeSlaveBody == body_.pointer()) {
		i2c_detail::disableSlaveInterrupts(body_->handle);
		i2c_detail::clearActiveSlave();
	}
	LL_I2C_Disable(body_->handle);
}

void I2CBus::beginWrite(u8 address) const {
	body_->writeAddress = address;
	body_->writeLength = 0;
	body_->writeOverflowed = false;
	body_->writeActive = true;
}

void I2CBus::sendByte(u8 value) const {
	if (!body_->writeActive) {
		return;
	}
	if (body_->writeLength >= i2c_detail::TRANSACTION_CAPACITY) {
		body_->writeOverflowed = true;
		return;
	}
	body_->writeBuffer[body_->writeLength] = value;
	body_->writeLength = body_->writeLength + 1;
}

I2CStatus I2CBus::endWrite() const {
	if (!body_->writeActive) {
		return I2CStatus::OTHER;
	}
	body_->writeActive = false;
	const I2CStatus status = transmitTransaction(
		body_->handle,
		body_->writeAddress,
		body_->writeBuffer,
		body_->writeLength);
	if (body_->writeOverflowed) {
		return I2CStatus::DATA_TOO_LONG;
	}
	return status;
}

void I2CBus::write(u8 address, const core_array::Array<u8> &data) const {
	beginWrite(address);
	for (u16 index = 0; index < data.length(); index++) {
		sendByte(data[index]);
	}
	endWrite();
}

u8 I2CBus::requestFrom(u8 address, u8 quantity) {
	body_->readBuffer.truncate(I2C_EMPTY_BYTE);
	body_->readBuffer.reserve(quantity);
	body_->readIndex = 0;

	while (LL_I2C_IsActiveFlag_BUSY(body_->handle));
	LL_I2C_GenerateStartCondition(body_->handle);
	while (!LL_I2C_IsActiveFlag_SB(body_->handle));
	LL_I2C_TransmitData8(body_->handle, (u8)((address << I2C_ADDRESS_SHIFT) | I2C_READ_BIT));
	while (!LL_I2C_IsActiveFlag_ADDR(body_->handle));
	LL_I2C_ClearFlag_ADDR(body_->handle);

	for (u8 index = 0; index < quantity; index++) {
		const bool isLastByte = index == (u8)(quantity - I2C_LAST_BYTE_OFFSET);
		if (isLastByte) {
			LL_I2C_AcknowledgeNextData(body_->handle, LL_I2C_NACK);
			LL_I2C_GenerateStopCondition(body_->handle);
		}
		while (!LL_I2C_IsActiveFlag_RXNE(body_->handle));
		body_->readBuffer.push(LL_I2C_ReceiveData8(body_->handle));
	}

	return (u8)body_->readBuffer.length();
}

u8 I2CBus::read() {
	if (body_->readIndex >= body_->readBuffer.length()) {
		return I2C_EMPTY_BYTE;
	}
	const u8 value = body_->readBuffer[body_->readIndex];
	body_->readIndex = body_->readIndex + 1;
	return value;
}

u8 I2CBus::available() const {
	return (u8)(body_->readBuffer.length() - body_->readIndex);
}

void I2CBus::initializeSlave(u8 address) const {
	if (address > I2C_MAX_SLAVE_ADDRESS) {
		return;
	}
	const I2CConfig *config = findI2CConfig(body_->handle);
	if (config == nullptr) {
		return;
	}

	if (
		i2c_detail::activeSlaveBody != nullptr &&
		i2c_detail::activeSlaveBody != body_.pointer()) {
		i2c_detail::stopSlavePeripheral(i2c_detail::activeSlaveHandle);
	}

	initialize();

	LL_I2C_Disable(body_->handle);
	LL_I2C_SetOwnAddress1(body_->handle, address, LL_I2C_OWNADDRESS1_7BIT);
	LL_I2C_AcknowledgeNextData(body_->handle, LL_I2C_ACK);
	body_->receiveActive = false;
	i2c_detail::resetSlaveTransaction(body_.pointer());
	i2c_detail::setActiveSlave(body_.pointer());

	LL_I2C_EnableIT_EVT(body_->handle);
	LL_I2C_EnableIT_BUF(body_->handle);
	LL_I2C_EnableIT_ERR(body_->handle);
	LL_I2C_Enable(body_->handle);
	NVIC_EnableIRQ(config->eventInterrupt);
	NVIC_EnableIRQ(config->errorInterrupt);
}

void I2CBus::onReceive(void (*handler)()) const {
	body_->receiveHandler = handler;
	i2c_detail::setActiveSlave(body_.pointer());
}

void I2CBus::onRequest(void (*handler)()) const {
	body_->requestHandler = handler;
	i2c_detail::setActiveSlave(body_.pointer());
}

void I2CBus::sendResponse(const core_array::Array<u8> &data) const {
	if (!body_->requestActive) {
		return;
	}
	for (u16 index = 0; index < data.length(); index++) {
		if (body_->responseLength >= i2c_detail::RESPONSE_CAPACITY) {
			return;
		}
		body_->responseBuffer[body_->responseLength] = data[index];
		body_->responseLength = body_->responseLength + 1;
	}
}

I2CBus getI2C(I2C selector) {
	switch (selector) {
		case I2C::I2C_1: {
			static I2CBus bus(I2C1, core_gpio::Pin::PIN_B7, core_gpio::Pin::PIN_B6);
			return bus;
		}
		case I2C::I2C_2: {
			static I2CBus bus(I2C2, core_gpio::Pin::PIN_B11, core_gpio::Pin::PIN_B10);
			return bus;
		}
		default:
			return I2CBus();
	}
}

} // namespace core_i2c

extern "C" void I2C1_EV_IRQHandler(void) {
	core_i2c::i2c_detail::handleEventInterrupt(I2C1);
}

extern "C" void I2C1_ER_IRQHandler(void) {
	core_i2c::i2c_detail::handleErrorInterrupt(I2C1);
}

extern "C" void I2C2_EV_IRQHandler(void) {
	core_i2c::i2c_detail::handleEventInterrupt(I2C2);
}

extern "C" void I2C2_ER_IRQHandler(void) {
	core_i2c::i2c_detail::handleErrorInterrupt(I2C2);
}
