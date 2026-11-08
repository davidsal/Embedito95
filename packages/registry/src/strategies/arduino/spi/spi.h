#ifndef _E95_SPI_H
#define _E95_SPI_H

#include <Arduino.h>
#include <SPI.h>
#include <core_type.h>
#include <core_array.h>
#include <core_memory.h>

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

namespace spi_detail {

// Maps the bus divisor to the AVR divider selector the SPI library expects.
// The AVR prescaler has no divisor above 128.
inline u8 resolveClockDivider(u16 divider) {
	switch (divider) {
		case CLOCK_DIVISOR_2: {
			return SPI_CLOCK_DIV2;
		}
		case CLOCK_DIVISOR_8: {
			return SPI_CLOCK_DIV8;
		}
		case CLOCK_DIVISOR_16: {
			return SPI_CLOCK_DIV16;
		}
		case CLOCK_DIVISOR_32: {
			return SPI_CLOCK_DIV32;
		}
		case CLOCK_DIVISOR_64: {
			return SPI_CLOCK_DIV64;
		}
		case CLOCK_DIVISOR_128: {
			return SPI_CLOCK_DIV128;
		}
		default: {
			return SPI_CLOCK_DIV4;
		}
	}
}

inline u8 resolveBitOrder(SpiBitOrder order) {
	if (order == SpiBitOrder::MSB_FIRST) {
		return MSBFIRST;
	}
	return LSBFIRST;
}

inline u8 resolveClockMode(SpiClockMode mode) {
	switch (mode) {
		case SpiClockMode::MODE_1: {
			return SPI_MODE1;
		}
		case SpiClockMode::MODE_2: {
			return SPI_MODE2;
		}
		case SpiClockMode::MODE_3: {
			return SPI_MODE3;
		}
		default: {
			return SPI_MODE0;
		}
	}
}

} // namespace spi_detail

struct SpiSavedSettings {
	u16 clockDivider;
	SpiClockMode clockMode;
	SpiBitOrder bitOrder;
};

struct SpiBusBody {
	SPIClass *handle;
	u16 clockDivider = spi_detail::CLOCK_DIVISOR_4;
	SpiClockMode clockMode = SpiClockMode::MODE_0;
	SpiBitOrder bitOrder = SpiBitOrder::MSB_FIRST;
	u8 transactionDepth = 0;
	SpiSavedSettings savedSettings[spi_detail::TRANSACTION_DEPTH_CAPACITY] = {};
};

class SpiBus {
public:
	SpiBus() : body_() {}

	SpiBus(SPIClass &handle) {
		this->body_ = core_mem::Ref<SpiBusBody>::emplace();
		this->body_->handle = &handle;
	}

	void initialize() const {
		body_->handle->begin();
		applyDefaultConfiguration();
	}

	void close() const {
		body_->handle->end();
		applyDefaultConfiguration();
	}

	void setClockDivider(u16 divider) const {
		body_->clockDivider = divider;
		body_->handle->setClockDivider(spi_detail::resolveClockDivider(divider));
	}

	void setBitOrder(SpiBitOrder order) const {
		body_->bitOrder = order;
		body_->handle->setBitOrder(spi_detail::resolveBitOrder(order));
	}

	void setClockMode(SpiClockMode mode) const {
		body_->clockMode = mode;
		body_->handle->setDataMode(spi_detail::resolveClockMode(mode));
	}

	void beginTransaction(u16 clockDivider, SpiClockMode mode, SpiBitOrder bitOrder) const {
		if (body_->transactionDepth >= spi_detail::TRANSACTION_DEPTH_CAPACITY) {
			return;
		}
		SpiSavedSettings &saved = body_->savedSettings[body_->transactionDepth];
		saved.clockDivider = body_->clockDivider;
		saved.clockMode = body_->clockMode;
		saved.bitOrder = body_->bitOrder;
		body_->transactionDepth++;
		setClockDivider(clockDivider);
		setClockMode(mode);
		setBitOrder(bitOrder);
	}

	void endTransaction() const {
		if (body_->transactionDepth == 0) {
			return;
		}
		body_->transactionDepth--;
		const SpiSavedSettings &saved = body_->savedSettings[body_->transactionDepth];
		setClockDivider(saved.clockDivider);
		setClockMode(saved.clockMode);
		setBitOrder(saved.bitOrder);
	}

	u8 transfer(u8 data) const {
		return (u8)body_->handle->transfer(data);
	}

	u16 transfer16(u16 value) const {
		return spi_detail::transferWord(
			*this,
			value,
			body_->bitOrder == SpiBitOrder::LSB_FIRST);
	}

	core_array::Array<u8> transferBuffer(const core_array::Array<u8> &data) const {
		core_array::Array<u8> received;
		spi_detail::transferBytes(*this, data, &received);
		return received;
	}

	void write(const core_array::Array<u8> &data) const {
		core_array::Array<u8> *discard = nullptr;
		spi_detail::transferBytes(*this, data, discard);
	}

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
	// begin()/end() only toggle the peripheral enable bit (SPE); they leave the
	// clock divider, clock mode and bit order in SPCR untouched. Reapply the
	// defaults through the same setters so the hardware and the tracked copy
	// stay in sync; otherwise a later transaction saves stale tracked values.
	void applyDefaultConfiguration() const {
		setClockDivider(spi_detail::CLOCK_DIVISOR_4);
		setClockMode(SpiClockMode::MODE_0);
		setBitOrder(SpiBitOrder::MSB_FIRST);
		body_->transactionDepth = 0;
	}

	// The handle is logically immutable; its payload holds the live bus state
	// (tracked settings and transaction stack), mutated by the const methods.
	mutable core_mem::Ref<SpiBusBody> body_;
};

_e95_replace_spiSupport

} // namespace core_spi

#endif
