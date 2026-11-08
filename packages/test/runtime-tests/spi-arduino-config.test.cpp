// Host compile+behaviour guard for the real arduino SPI header
// (strategies/arduino/spi/spi.h). The header is included verbatim against the
// AVR-like `SPIClass` stand-in, so a regression that calls a divider/bit-order/
// data-mode entry the AVR SPI library does not expose — or maps a divisor to
// the wrong selector — is caught here. The shared transfer loop is included
// separately (the emitted header inlines it through a marker), so this test
// exercises the settings and the buffer transfer against a fake bus.

#include <stdint.h>
#include <stdio.h>

namespace core_spi {
#include "packages/registry/src/strategies/shared/spi/spi_common.inc"
} // namespace core_spi

#define _e95_replace_spiSupport
#define _e95_replace_spiCommon
#include "packages/registry/src/strategies/arduino/spi/spi.h"

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

static void scenarioMapsClockDivisors() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.setClockDivider(2);
	CHECK(spi.clockDivider == SPI_CLOCK_DIV2);

	bus.setClockDivider(16);
	CHECK(spi.clockDivider == SPI_CLOCK_DIV16);

	bus.setClockDivider(128);
	CHECK(spi.clockDivider == SPI_CLOCK_DIV128);

	// The AVR prescaler stops at 128: an unknown divisor falls back to DIV4.
	bus.setClockDivider(256);
	CHECK(spi.clockDivider == SPI_CLOCK_DIV4);
}

static void scenarioMapsBitOrder() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.setBitOrder(core_spi::SpiBitOrder::LSB_FIRST);
	CHECK(spi.bitOrder == LSBFIRST);

	bus.setBitOrder(core_spi::SpiBitOrder::MSB_FIRST);
	CHECK(spi.bitOrder == MSBFIRST);
}

static void scenarioMapsClockModes() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.setClockMode(core_spi::SpiClockMode::MODE_0);
	CHECK(spi.dataMode == SPI_MODE0);

	bus.setClockMode(core_spi::SpiClockMode::MODE_1);
	CHECK(spi.dataMode == SPI_MODE1);

	bus.setClockMode(core_spi::SpiClockMode::MODE_2);
	CHECK(spi.dataMode == SPI_MODE2);

	bus.setClockMode(core_spi::SpiClockMode::MODE_3);
	CHECK(spi.dataMode == SPI_MODE3);
}

static void scenarioRestoresConfigurationAfterTransaction() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.setClockDivider(8);
	bus.setClockMode(core_spi::SpiClockMode::MODE_1);
	bus.setBitOrder(core_spi::SpiBitOrder::MSB_FIRST);

	bus.beginTransaction(16, core_spi::SpiClockMode::MODE_3, core_spi::SpiBitOrder::LSB_FIRST);
	CHECK(spi.clockDivider == SPI_CLOCK_DIV16);
	CHECK(spi.dataMode == SPI_MODE3);
	CHECK(spi.bitOrder == LSBFIRST);

	bus.endTransaction();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV8);
	CHECK(spi.dataMode == SPI_MODE1);
	CHECK(spi.bitOrder == MSBFIRST);
}

static void scenarioNestsTwoTransactionsInLifoOrder() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.setClockDivider(2);
	bus.setClockMode(core_spi::SpiClockMode::MODE_0);
	bus.setBitOrder(core_spi::SpiBitOrder::MSB_FIRST);

	bus.beginTransaction(4, core_spi::SpiClockMode::MODE_1, core_spi::SpiBitOrder::LSB_FIRST);
	bus.beginTransaction(8, core_spi::SpiClockMode::MODE_2, core_spi::SpiBitOrder::MSB_FIRST);

	// A third open transaction exceeds the supported nesting and is ignored.
	bus.beginTransaction(16, core_spi::SpiClockMode::MODE_3, core_spi::SpiBitOrder::LSB_FIRST);
	CHECK(spi.clockDivider == SPI_CLOCK_DIV8);
	CHECK(spi.dataMode == SPI_MODE2);
	CHECK(spi.bitOrder == MSBFIRST);

	bus.endTransaction();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV4);
	CHECK(spi.dataMode == SPI_MODE1);
	CHECK(spi.bitOrder == LSBFIRST);

	bus.endTransaction();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV2);
	CHECK(spi.dataMode == SPI_MODE0);
	CHECK(spi.bitOrder == MSBFIRST);
}

static void scenarioEndTransactionWithoutBeginIsNoOp() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.setClockDivider(8);
	bus.setClockMode(core_spi::SpiClockMode::MODE_2);
	bus.setBitOrder(core_spi::SpiBitOrder::LSB_FIRST);

	bus.endTransaction();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV8);
	CHECK(spi.dataMode == SPI_MODE2);
	CHECK(spi.bitOrder == LSBFIRST);
}

static void scenarioClosesBusAndResetsConfiguration() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.initialize();
	bus.setClockDivider(16);
	bus.setClockMode(core_spi::SpiClockMode::MODE_3);
	bus.setBitOrder(core_spi::SpiBitOrder::LSB_FIRST);

	// A second close must stay safe and leave the same reset configuration.
	bus.close();
	bus.close();
	CHECK(spi.endCount == 2);

	// end() only clears SPE: it does not touch the divider/mode/bit-order bits
	// in SPCR. close() must therefore apply the defaults itself so the tracked
	// copy and the hardware agree.
	CHECK(spi.clockDivider == SPI_CLOCK_DIV4);
	CHECK(spi.dataMode == SPI_MODE0);
	CHECK(spi.bitOrder == MSBFIRST);

	// The next transaction saves those real defaults and restores them.
	bus.beginTransaction(8, core_spi::SpiClockMode::MODE_1, core_spi::SpiBitOrder::MSB_FIRST);
	bus.endTransaction();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV4);
	CHECK(spi.dataMode == SPI_MODE0);
	CHECK(spi.bitOrder == MSBFIRST);
}

static void scenarioInitializeReappliesDefaults() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.initialize();
	bus.setClockDivider(64);
	bus.setClockMode(core_spi::SpiClockMode::MODE_2);
	bus.setBitOrder(core_spi::SpiBitOrder::LSB_FIRST);

	// begin() only sets SPE, so a stale SPCR configuration survives it; the
	// bus must reapply the defaults instead of assuming the library reset them.
	bus.initialize();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV4);
	CHECK(spi.dataMode == SPI_MODE0);
	CHECK(spi.bitOrder == MSBFIRST);

	// Same after the documented close() + initialize() sequence: the tracked
	// state must not claim DIV4 while the hardware still shifts at DIV64.
	bus.setClockDivider(64);
	bus.close();
	bus.initialize();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV4);
	CHECK(spi.dataMode == SPI_MODE0);
	CHECK(spi.bitOrder == MSBFIRST);

	bus.beginTransaction(16, core_spi::SpiClockMode::MODE_3, core_spi::SpiBitOrder::LSB_FIRST);
	bus.endTransaction();
	CHECK(spi.clockDivider == SPI_CLOCK_DIV4);
	CHECK(spi.dataMode == SPI_MODE0);
	CHECK(spi.bitOrder == MSBFIRST);
}

static void scenarioTransfersWordInConfiguredBitOrder() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	bus.setBitOrder(core_spi::SpiBitOrder::MSB_FIRST);
	const u16 echoedMostSignificantFirst = bus.transfer16(0x1234);
	CHECK(spi.sentBytes[0] == 0x12);
	CHECK(spi.sentBytes[1] == 0x34);
	CHECK(echoedMostSignificantFirst == 0x1234);
	CHECK(spi.transferCount == 2);

	SPIClass lowFirstSpi;
	core_spi::SpiBus lowFirstBus(lowFirstSpi);
	lowFirstBus.setBitOrder(core_spi::SpiBitOrder::LSB_FIRST);
	const u16 echoedLeastSignificantFirst = lowFirstBus.transfer16(0x1234);
	CHECK(lowFirstSpi.sentBytes[0] == 0x34);
	CHECK(lowFirstSpi.sentBytes[1] == 0x12);
	CHECK(echoedLeastSignificantFirst == 0x1234);
}

static void scenarioTransfersBuffer() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	core_array::Array<u8> outgoing;
	outgoing.push(10);
	outgoing.push(20);
	outgoing.push(30);

	const core_array::Array<u8> received = bus.transferBuffer(outgoing);

	CHECK(received.length() == 3);
	CHECK(received[0] == 10);
	CHECK(received[1] == 20);
	CHECK(received[2] == 30);
	CHECK(spi.transferCount == 3);
}

static void scenarioWriteDiscardsReceived() {
	SPIClass spi;
	core_spi::SpiBus bus(spi);

	core_array::Array<u8> outgoing;
	outgoing.push(1);
	outgoing.push(2);

	bus.write(outgoing);
	CHECK(spi.transferCount == 2);
}

int main() {
	scenarioMapsClockDivisors();
	scenarioMapsBitOrder();
	scenarioMapsClockModes();
	scenarioRestoresConfigurationAfterTransaction();
	scenarioNestsTwoTransactionsInLifoOrder();
	scenarioEndTransactionWithoutBeginIsNoOp();
	scenarioClosesBusAndResetsConfiguration();
	scenarioInitializeReappliesDefaults();
	scenarioTransfersWordInConfiguredBitOrder();
	scenarioTransfersBuffer();
	scenarioWriteDiscardsReceived();

	if (failures == 0) {
		printf("SPI arduino config: all scenarios passed\n");
		return 0;
	}
	printf("SPI arduino config: %d check(s) failed\n", failures);
	return 1;
}
