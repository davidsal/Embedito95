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
static const u32 I2C_APB1_CLOCK = _e95_replace_i2cApb1Clock;
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
_e95_replace_i2cConfigs
};

static const I2CConfig *findI2CConfig(I2C_TypeDef *i2c) {
	for (const I2CConfig &config : I2C_CONFIGS) {
		if (config.i2c == i2c) {
			return &config;
		}
	}
	return nullptr;
}

_e95_replace_i2cSlave

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

_e95_replace_getI2C

} // namespace core_i2c

_e95_replace_i2cInterruptHandlers
