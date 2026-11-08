#ifndef _E95_I2C_H
#define _E95_I2C_H

#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_i2c.h"
#include "../type/core_type.h"
#include "../type/core_array.h"
#include "../system/core_memory.h"
#include "../gpio/core_gpio.h"

namespace core_i2c {

_e95_replace_i2cCommon

struct I2CBusBody {
	I2C_TypeDef *handle;
	core_gpio::Pin sda;
	core_gpio::Pin scl;
	core_array::Array<u8> readBuffer;
	u16 readIndex;
	u8 writeAddress = 0;
	u8 writeLength = 0;
	bool writeActive = false;
	bool writeOverflowed = false;
	u8 writeBuffer[i2c_detail::TRANSACTION_CAPACITY] = {};
	void (*receiveHandler)() = nullptr;
	void (*requestHandler)() = nullptr;
	u8 responseBuffer[i2c_detail::RESPONSE_CAPACITY] = {};
	u8 responseLength = 0;
	u8 responseIndex = 0;
	bool requestActive = false;
	bool slaveTransmitter = false;
	bool receiveActive = false;
};

class I2CBus {
public:
	I2CBus() : body_() {}

	I2CBus(I2C_TypeDef *handle, core_gpio::Pin sda, core_gpio::Pin scl) {
		this->body_ = core_mem::Ref<I2CBusBody>::emplace();
		this->body_->handle = handle;
		this->body_->sda = sda;
		this->body_->scl = scl;
		this->body_->readIndex = 0;
	}

	void initialize() const;
	void setClock(u32 frequency) const;
	void close() const;
	void beginWrite(u8 address) const;
	void sendByte(u8 value) const;
	I2CStatus endWrite() const;
	void write(u8 address, const core_array::Array<u8> &data) const;
	u8 requestFrom(u8 address, u8 quantity);
	u8 read();
	u8 available() const;

	void initializeSlave(u8 address) const;
	void onReceive(void (*handler)()) const;
	void onRequest(void (*handler)()) const;
	void sendResponse(const core_array::Array<u8> &data) const;

	inline bool operator==(const I2CBus &other) const {
		if (!body_.hasValue() && !other.body_.hasValue()) {
			return true;
		}
		if (!body_.hasValue() || !other.body_.hasValue()) {
			return false;
		}
		return (
			body_->handle == other.body_->handle &&
			body_->sda == other.body_->sda &&
			body_->scl == other.body_->scl
		);
	}

	inline bool operator!=(const I2CBus &other) const {
		return !(*this == other);
	}

private:
	mutable core_mem::Ref<I2CBusBody> body_;
};

_e95_replace_i2cSupport

} // namespace core_i2c

#endif
