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
