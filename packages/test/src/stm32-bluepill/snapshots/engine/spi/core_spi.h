#ifndef _E95_SPI_H
#define _E95_SPI_H

#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_spi.h"
#include "../type/core_type.h"
#include "../type/core_array.h"
#include "../system/core_memory.h"
#include "../gpio/core_gpio.h"

namespace core_spi {

// Shared SPI helpers, platform-agnostic.
// Single source of truth, inlined into each platform's SPI implementation
// through the `_e95_replace_spiCommon` marker. It is self-contained (only
// `<stdint.h>` types) so the host can compile and exercise it directly in
// runtime-tests/spi-transfer.test.cpp against a fake bus.
//
// Four pieces live here:
//   - the divisor set the bus clock API accepts (same unit on every target);
//   - the transaction depth cap, shared so every target rejects the same extra
//     nesting level;
//   - the buffer-transfer loop, which walks the outgoing buffer through
//     `bus.transfer(byte)` and, when `received` is not null, collects the bytes
//     read back position by position. Passing a null `received` discards them,
//     so the very same loop backs both the buffer transfer and the plain write
//     without duplicating the iteration;
//   - the word-transfer helper, which splits a 16-bit value into two bytes and
//     reassembles the received bytes following the configured bit order.

namespace spi_detail {

const uint16_t CLOCK_DIVISOR_2 = 2;
const uint16_t CLOCK_DIVISOR_4 = 4;
const uint16_t CLOCK_DIVISOR_8 = 8;
const uint16_t CLOCK_DIVISOR_16 = 16;
const uint16_t CLOCK_DIVISOR_32 = 32;
const uint16_t CLOCK_DIVISOR_64 = 64;
const uint16_t CLOCK_DIVISOR_128 = 128;
const uint16_t CLOCK_DIVISOR_256 = 256;

const uint8_t TRANSACTION_DEPTH_CAPACITY = 2;

const uint16_t WORD_LOW_BYTE_MASK = 0x00FF;
const uint8_t BYTE_BIT_COUNT = 8;

template <typename BusType, typename BufferType>
void transferBytes(const BusType &bus, const BufferType &input, BufferType *received) {
	for (uint16_t index = 0; index < input.length(); index++) {
		const uint8_t result = bus.transfer(input[index]);
		if (received != nullptr) {
			received->push(result);
		}
	}
}

// Sends the two bytes of `value` and reassembles the two received bytes with
// the same significance: most-significant byte first, or least-significant byte
// first, matching the order the bus uses for each byte's bits.
template <typename BusType>
uint16_t transferWord(const BusType &bus, uint16_t value, bool isLeastSignificantBitFirst) {
	const uint8_t lowByte = (uint8_t)(value & WORD_LOW_BYTE_MASK);
	const uint8_t highByte = (uint8_t)(value >> BYTE_BIT_COUNT);

	if (isLeastSignificantBitFirst) {
		const uint8_t receivedLowByte = bus.transfer(lowByte);
		const uint8_t receivedHighByte = bus.transfer(highByte);
		return (uint16_t)(((uint16_t)receivedHighByte << BYTE_BIT_COUNT) | receivedLowByte);
	}

	const uint8_t receivedHighByte = bus.transfer(highByte);
	const uint8_t receivedLowByte = bus.transfer(lowByte);
	return (uint16_t)(((uint16_t)receivedHighByte << BYTE_BIT_COUNT) | receivedLowByte);
}

} // namespace spi_detail

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

typedef enum : u8 {
	SPI_1 = 1,
	SPI_2 = 2
} SPI;


SpiBus getSPI(SPI selector);

} // namespace core_spi

#endif
