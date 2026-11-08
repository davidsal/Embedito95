#ifndef _E95_SPI_H
#define _E95_SPI_H

#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_spi.h"
#include "../type/core_type.h"
#include "../type/core_array.h"
#include "../system/core_memory.h"
#include "../gpio/core_gpio.h"

namespace core_spi {

_e95_replace_spiCommon

typedef enum : u8 {
	MSB_FIRST = 0,
	LSB_FIRST = 1
} SpiBitOrder;

typedef enum : u8 {
	MODE_0 = 0,
	MODE_1 = 1,
	MODE_2 = 2,
	MODE_3 = 3
} SpiClockMode;

struct SpiSavedSettings {
	// The baud-rate prescaler lives in CR1.BR[2:0] on STM32F1 (there is no
	// BRR register), so this snapshot restores the prescaler as well.
	u32 controlRegister1;
	u32 controlRegister2;
	SpiBitOrder bitOrder;
};

struct SpiBusBody {
	SPI_TypeDef *handle;
	core_gpio::Pin sck;
	core_gpio::Pin mosi;
	core_gpio::Pin miso;
	SpiBitOrder bitOrder = SpiBitOrder::MSB_FIRST;
	u8 transactionDepth = 0;
	SpiSavedSettings savedSettings[spi_detail::TRANSACTION_DEPTH_CAPACITY] = {};
};

class SpiBus {
public:
	SpiBus() : body_() {}

	SpiBus(SPI_TypeDef *handle, core_gpio::Pin sck, core_gpio::Pin mosi, core_gpio::Pin miso) {
		this->body_ = core_mem::Ref<SpiBusBody>::emplace();
		this->body_->handle = handle;
		this->body_->sck = sck;
		this->body_->mosi = mosi;
		this->body_->miso = miso;
	}

	void initialize() const;
	void close() const;
	void setClockDivider(u16 divider) const;
	void setBitOrder(SpiBitOrder order) const;
	void setClockMode(SpiClockMode mode) const;
	void beginTransaction(u16 clockDivider, SpiClockMode mode, SpiBitOrder bitOrder) const;
	void endTransaction() const;
	u8 transfer(u8 data) const;
	u16 transfer16(u16 value) const;
	core_array::Array<u8> transferBuffer(const core_array::Array<u8> &data) const;
	void write(const core_array::Array<u8> &data) const;

	inline bool operator==(const SpiBus &other) const {
		if (!body_.hasValue() && !other.body_.hasValue()) {
			return true;
		}
		if (!body_.hasValue() || !other.body_.hasValue()) {
			return false;
		}
		return body_->handle == other.body_->handle;
	}

	inline bool operator!=(const SpiBus &other) const {
		return !(*this == other);
	}

private:
	// The handle is logically immutable; its payload holds the live bus state
	// (tracked bit order and transaction stack), mutated by the const methods.
	mutable core_mem::Ref<SpiBusBody> body_;
};

_e95_replace_spiSupport

} // namespace core_spi

#endif
