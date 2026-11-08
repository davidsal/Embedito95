// Host unit test for the shared SPI buffer-transfer helper
// (strategies/shared/spi/spi_common.inc). The helper is inlined into every
// platform's SPI implementation; this test compiles the very same source on the
// host against a fake bus and a fake buffer, so the transfer iteration is
// validated before it reaches the device.

#include <stdint.h>
#include <stdio.h>

namespace core_spi {
#include "packages/registry/src/strategies/shared/spi/spi_common.inc"
} // namespace core_spi

using core_spi::spi_detail::transferBytes;
using core_spi::spi_detail::transferWord;

struct FakeBus {
	const uint8_t *responses;
	uint16_t responseCount;
	mutable uint16_t nextResponse;
	mutable uint16_t transferCount;

	FakeBus() : responses(nullptr), responseCount(0), nextResponse(0), transferCount(0) {}

	uint8_t transfer(uint8_t data) const {
		const uint8_t response = responses[nextResponse % responseCount];
		nextResponse++;
		transferCount++;
		(void)data;
		return response;
	}
};

struct FakeWordBus {
	const uint8_t *responses;
	uint16_t responseCount;
	mutable uint8_t sentBytes[2];
	mutable uint16_t nextResponse;
	mutable uint16_t sendCount;

	FakeWordBus()
		: responses(nullptr)
		, responseCount(0)
		, nextResponse(0)
		, sendCount(0) {}

	uint8_t transfer(uint8_t data) const {
		sentBytes[sendCount] = data;
		sendCount++;
		const uint8_t response = responses[nextResponse % responseCount];
		nextResponse++;
		return response;
	}
};

struct FakeBuffer {
	uint8_t values[32];
	uint16_t size;

	FakeBuffer() : size(0) {}

	uint16_t length() const {
		return size;
	}

	const uint8_t &operator[](uint16_t index) const {
		return values[index];
	}

	void push(uint8_t value) {
		values[size] = value;
		size++;
	}
};

static const uint8_t RESPONSES[] = { 9, 8, 7, 6 };
static const uint8_t WORD_RESPONSES[] = { 0xAB, 0xCD };

static FakeWordBus makeWordBus() {
	FakeWordBus bus;
	bus.responses = WORD_RESPONSES;
	bus.responseCount = (uint16_t)(sizeof(WORD_RESPONSES) / sizeof(WORD_RESPONSES[0]));
	return bus;
}

static FakeBus makeBus() {
	FakeBus bus;
	bus.responses = RESPONSES;
	bus.responseCount = (uint16_t)(sizeof(RESPONSES) / sizeof(RESPONSES[0]));
	return bus;
}

static FakeBuffer makeBuffer(const uint8_t *values, uint16_t count) {
	FakeBuffer buffer;
	for (uint16_t index = 0; index < count; index++) {
		buffer.push(values[index]);
	}
	return buffer;
}

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void scenarioCollectsReceivedBytesInOrder() {
	const uint8_t outgoing[] = { 1, 2, 3 };
	FakeBuffer input = makeBuffer(outgoing, 3);
	FakeBuffer received;
	FakeBus bus = makeBus();

	transferBytes(bus, input, &received);

	CHECK(received.size == 3);
	CHECK(received.values[0] == 9);
	CHECK(received.values[1] == 8);
	CHECK(received.values[2] == 7);
	CHECK(bus.transferCount == 3);
}

static void scenarioDiscardsWhenOutputIsNull() {
	const uint8_t outgoing[] = { 1, 2, 3, 4 };
	FakeBuffer input = makeBuffer(outgoing, 4);
	FakeBuffer *discard = nullptr;
	FakeBus bus = makeBus();

	transferBytes(bus, input, discard);

	CHECK(bus.transferCount == 4);
}

static void scenarioEmptyInputTransfersNothing() {
	FakeBuffer input;
	FakeBuffer received;
	FakeBus bus = makeBus();

	transferBytes(bus, input, &received);

	CHECK(received.size == 0);
	CHECK(bus.transferCount == 0);
}

static void scenarioLongerThanResponseTableWraps() {
	const uint8_t outgoing[] = { 0, 0, 0, 0, 0, 0 };
	FakeBuffer input = makeBuffer(outgoing, 6);
	FakeBuffer received;
	FakeBus bus = makeBus();

	transferBytes(bus, input, &received);

	CHECK(received.size == 6);
	CHECK(received.values[0] == 9);
	CHECK(received.values[3] == 6);
	CHECK(received.values[4] == 9);
	CHECK(received.values[5] == 8);
}

static void scenarioTransfersWordMostSignificantByteFirst() {
	FakeWordBus bus = makeWordBus();

	const uint16_t received = transferWord(bus, 0x1234, false);

	CHECK(bus.sendCount == 2);
	CHECK(bus.sentBytes[0] == 0x12);
	CHECK(bus.sentBytes[1] == 0x34);
	CHECK(received == 0xABCD);
}

static void scenarioTransfersWordLeastSignificantByteFirst() {
	FakeWordBus bus = makeWordBus();

	const uint16_t received = transferWord(bus, 0x1234, true);

	CHECK(bus.sendCount == 2);
	CHECK(bus.sentBytes[0] == 0x34);
	CHECK(bus.sentBytes[1] == 0x12);
	CHECK(received == 0xCDAB);
}

static void scenarioTransfersWordBoundaryValues() {
	FakeWordBus bus = makeWordBus();

	const uint16_t received = transferWord(bus, 0x00FF, false);

	CHECK(bus.sentBytes[0] == 0x00);
	CHECK(bus.sentBytes[1] == 0xFF);
	CHECK(received == 0xABCD);
}

int main() {
	scenarioCollectsReceivedBytesInOrder();
	scenarioDiscardsWhenOutputIsNull();
	scenarioEmptyInputTransfersNothing();
	scenarioLongerThanResponseTableWraps();
	scenarioTransfersWordMostSignificantByteFirst();
	scenarioTransfersWordLeastSignificantByteFirst();
	scenarioTransfersWordBoundaryValues();

	if (failures == 0) {
		printf("SPI transfer helper: all scenarios passed\n");
		return 0;
	}
	printf("SPI transfer helper: %d check(s) failed\n", failures);
	return 1;
}
