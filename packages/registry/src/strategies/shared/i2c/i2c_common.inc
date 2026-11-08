// Shared I2C transaction rules, platform-agnostic.
// Single source of truth, inlined into each platform's I2C implementation
// through the `_e95_replace_i2cCommon` marker. It is self-contained (only
// `<stdint.h>` types) so the host can compile and exercise it directly in
// runtime-tests/i2c-arduino-config.test.cpp against a fake bus.
//
// The transaction capacity is the same on every target: a write transaction
// holds at most 32 bytes, so a program that queues more sees the same
// `DATA_TOO_LONG` result regardless of the platform that runs it.

namespace i2c_detail {

const uint8_t TRANSACTION_CAPACITY = 32;

// The slave response buffer mirrors the platform bus buffer: a response larger
// than this is truncated to the bytes the bus can hold.
const uint8_t RESPONSE_CAPACITY = 32;

} // namespace i2c_detail

// Result of ending a write transaction. The numeric codes are part of the
// public contract and are the same on every target.
typedef enum : uint8_t {
	OK = 0,
	DATA_TOO_LONG = 1,
	ADDRESS_NACK = 2,
	DATA_NACK = 3,
	OTHER = 4
} I2CStatus;
