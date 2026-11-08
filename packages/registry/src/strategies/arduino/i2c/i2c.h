#ifndef _E95_I2C_H
#define _E95_I2C_H

#include <Arduino.h>
#include <Wire.h>
#include <core_type.h>
#include <core_array.h>
#include <core_memory.h>

namespace core_i2c {

_e95_replace_i2cCommon

struct I2CBusBody {
	TwoWire *handle;
	u8 sda;
	u8 scl;
	u8 writeAddress = 0;
	u8 writeLength = 0;
	bool writeActive = false;
	bool writeOverflowed = false;
	void (*receiveHandler)() = nullptr;
	void (*requestHandler)() = nullptr;
	u8 responseBuffer[i2c_detail::RESPONSE_CAPACITY] = {};
	u8 responseLength = 0;
	bool requestActive = false;
};

namespace i2c_detail {

// The platform registers one C callback per bus, but the callback receives no
// bus argument. Only one bus can listen as a slave at a time, so the most
// recently configured bus owns the dispatch.
inline I2CBusBody *activeSlaveBody = nullptr;

inline void dispatchReceive(int count) {
	(void)count;
	if (activeSlaveBody == nullptr || activeSlaveBody->receiveHandler == nullptr) {
		return;
	}
	activeSlaveBody->receiveHandler();
}

inline void dispatchRequest() {
	if (activeSlaveBody == nullptr) {
		return;
	}
	I2CBusBody *body = activeSlaveBody;
	body->responseLength = 0;
	body->requestActive = true;
	if (body->requestHandler != nullptr) {
		body->requestHandler();
	}
	for (u8 index = 0; index < body->responseLength; index++) {
		body->handle->write(body->responseBuffer[index]);
	}
	body->requestActive = false;
}

} // namespace i2c_detail

namespace i2c_detail {

// The platform end-transmission codes share the order of I2CStatus, so any
// code past the last documented one collapses to OTHER.
inline I2CStatus resolveArduinoStatus(u8 rawStatus) {
	if (rawStatus > (u8)I2CStatus::OTHER) {
		return I2CStatus::OTHER;
	}
	return (I2CStatus)rawStatus;
}

} // namespace i2c_detail

class I2CBus {
public:
	I2CBus() : body_() {}

	I2CBus(TwoWire &handle, u8 sda, u8 scl) {
		this->body_ = core_mem::Ref<I2CBusBody>::emplace();
		this->body_->handle = &handle;
		this->body_->sda = sda;
		this->body_->scl = scl;
	}

	void initialize() const {
#if defined(ARDUINO_ARCH_ESP32)
		body_->handle->begin(body_->sda, body_->scl);
#else
		body_->handle->begin();
#endif
	}

	void setClock(u32 frequency) const {
		body_->handle->setClock(frequency);
	}

	void close() const {
		body_->writeActive = false;
		body_->writeLength = 0;
		body_->writeOverflowed = false;
		body_->receiveHandler = nullptr;
		body_->requestHandler = nullptr;
		body_->responseLength = 0;
		body_->requestActive = false;
		if (i2c_detail::activeSlaveBody == body_.pointer()) {
			i2c_detail::activeSlaveBody = nullptr;
		}
		body_->handle->end();
	}

	void beginWrite(u8 address) const {
		body_->writeAddress = address;
		body_->writeLength = 0;
		body_->writeOverflowed = false;
		body_->writeActive = true;
		body_->handle->beginTransmission(address);
	}

	void sendByte(u8 value) const {
		if (!body_->writeActive) {
			return;
		}
		if (body_->writeLength >= i2c_detail::TRANSACTION_CAPACITY) {
			body_->writeOverflowed = true;
			return;
		}
		body_->handle->write(value);
		body_->writeLength = body_->writeLength + 1;
	}

	I2CStatus endWrite() const {
		if (!body_->writeActive) {
			return I2CStatus::OTHER;
		}
		body_->writeActive = false;
		const u8 rawStatus = (u8)body_->handle->endTransmission();
		if (body_->writeOverflowed) {
			return I2CStatus::DATA_TOO_LONG;
		}
		return i2c_detail::resolveArduinoStatus(rawStatus);
	}

	void write(u8 address, const core_array::Array<u8> &data) const {
		beginWrite(address);
		for (u16 index = 0; index < data.length(); index++) {
			sendByte(data[index]);
		}
		endWrite();
	}

	u8 requestFrom(u8 address, u8 quantity) const {
		return (u8)body_->handle->requestFrom(address, quantity);
	}

	u8 read() const {
		return (u8)body_->handle->read();
	}

	u8 available() const {
		return (u8)body_->handle->available();
	}

	void initializeSlave(u8 address) const {
		body_->handle->begin(address);
		body_->handle->onReceive(i2c_detail::dispatchReceive);
		body_->handle->onRequest(i2c_detail::dispatchRequest);
		body_->responseLength = 0;
		body_->requestActive = false;
		i2c_detail::activeSlaveBody = body_.pointer();
	}

	void onReceive(void (*handler)()) const {
		body_->receiveHandler = handler;
		body_->handle->onReceive(i2c_detail::dispatchReceive);
		i2c_detail::activeSlaveBody = body_.pointer();
	}

	void onRequest(void (*handler)()) const {
		body_->requestHandler = handler;
		body_->handle->onRequest(i2c_detail::dispatchRequest);
		i2c_detail::activeSlaveBody = body_.pointer();
	}

	void sendResponse(const core_array::Array<u8> &data) const {
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
