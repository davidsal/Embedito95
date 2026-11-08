// Host compile+behaviour guard for the generated STM32 SPI engine translation
// unit (snapshots/engine/spi/core_spi.cpp). The real generated source is
// compiled against the host LL stand-ins, so a register that does not exist on
// the STM32F1 (e.g. BRR) fails to compile here as well as in the ARM syntax
// check. The scenarios then assert the observable register behaviour: the
// prescaler lives in CR1.BR[2:0], two transactions nest in LIFO order, an exact
// CR1/CR2 snapshot is restored, and close is idempotent.
//
// The generated engine source is compiled through its real includes; only the
// platform LL headers and the GPIO pin table are host stand-ins.

#include "packages/test/src/stm32-bluepill/snapshots/engine/spi/core_spi.cpp"

#include <stdint.h>
#include <stdio.h>

static int failures = 0;

#define CHECK(condition)                                                         \
	do {                                                                         \
		if (!(condition)) {                                                       \
			failures++;                                                            \
			printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);            \
		}                                                                        \
	} while (0)

namespace core_gpio {

	const _e95_PinInfo _e95_PINS[36] = {};
	uint16_t pinAlternateCallCount = 0;

	void _e95_setPinAlternate(Pin pin) {
		(void)pin;
		pinAlternateCallCount++;
	}

} // namespace core_gpio

static void resetHardware() {
	e95Spi1Registers = SPI_TypeDef();
	e95Spi2Registers = SPI_TypeDef();
	e95EnabledSpiClockCount = 0;
	e95HostPinModeCallCount = 0;
	e95HostLastPinMode = 0xFFFFFFFFUL;
	e95SpiBusyPollCount = 0;
	e95SpiDisabledWhileBusyCount = 0;
	core_gpio::pinAlternateCallCount = 0;
}

static core_spi::SpiBus makeBus() {
	return core_spi::SpiBus(
		SPI1,
		core_gpio::Pin::PIN_A5,
		core_gpio::Pin::PIN_A7,
		core_gpio::Pin::PIN_A6);
}

static void scenarioInitializeConfiguresDefaults() {
	resetHardware();
	const core_spi::SpiBus bus = makeBus();

	bus.initialize();

	CHECK(LL_SPI_IsEnabled(SPI1) != 0);
	CHECK((SPI1->CR1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV8);
	CHECK((SPI1->CR1 & SPI_CR1_MSTR) != 0);
	CHECK((SPI1->CR1 & SPI_CR1_LSBFIRST) == 0);
	CHECK((SPI1->CR1 & SPI_CR1_CPOL) == 0);
	CHECK((SPI1->CR1 & SPI_CR1_CPHA) == 0);
	CHECK(e95EnabledSpiClockCount == 1);
	CHECK(core_gpio::pinAlternateCallCount == 3);
}

static void scenarioNestsTwoTransactionsAndRestoresExactly() {
	resetHardware();
	const core_spi::SpiBus bus = makeBus();

	bus.initialize();
	bus.setClockDivider(64);
	bus.setClockMode(core_spi::SpiClockMode::MODE_2);
	bus.setBitOrder(core_spi::SpiBitOrder::LSB_FIRST);

	// Snapshot the exact register state after the per-device setup.
	const uint32_t configuredCr1 = SPI1->CR1;
	const uint32_t configuredCr2 = SPI1->CR2;
	CHECK((configuredCr1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV64);

	bus.beginTransaction(16, core_spi::SpiClockMode::MODE_3, core_spi::SpiBitOrder::MSB_FIRST);
	const uint32_t outerCr1 = SPI1->CR1;
	CHECK((outerCr1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV16);
	CHECK((outerCr1 & SPI_CR1_CPOL) != 0);
	CHECK((outerCr1 & SPI_CR1_CPHA) != 0);
	CHECK((outerCr1 & SPI_CR1_LSBFIRST) == 0);

	bus.beginTransaction(256, core_spi::SpiClockMode::MODE_1, core_spi::SpiBitOrder::LSB_FIRST);
	CHECK((SPI1->CR1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV256);
	CHECK((SPI1->CR1 & SPI_CR1_CPOL) == 0);
	CHECK((SPI1->CR1 & SPI_CR1_CPHA) != 0);
	CHECK((SPI1->CR1 & SPI_CR1_LSBFIRST) != 0);

	// The third open transaction exceeds the supported nesting and is ignored.
	bus.beginTransaction(8, core_spi::SpiClockMode::MODE_0, core_spi::SpiBitOrder::MSB_FIRST);
	CHECK((SPI1->CR1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV256);
	CHECK((SPI1->CR1 & SPI_CR1_LSBFIRST) != 0);

	CHECK(bus.transfer16(0x1234) == 0x1234);

	bus.endTransaction();
	CHECK(SPI1->CR1 == outerCr1);
	CHECK(SPI1->CR2 == configuredCr2);

	bus.endTransaction();
	CHECK(SPI1->CR1 == configuredCr1);
	CHECK(SPI1->CR2 == configuredCr2);

	// An unmatched endTransaction is a no-op and leaves the registers intact.
	bus.endTransaction();
	CHECK(SPI1->CR1 == configuredCr1);
	CHECK(SPI1->CR2 == configuredCr2);
}

static void scenarioTransfer16FollowsConfiguredBitOrder() {
	resetHardware();
	const core_spi::SpiBus bus = makeBus();

	bus.initialize();
	bus.setBitOrder(core_spi::SpiBitOrder::MSB_FIRST);
	CHECK(bus.transfer16(0x1234) == 0x1234);

	bus.setBitOrder(core_spi::SpiBitOrder::LSB_FIRST);
	CHECK(bus.transfer16(0xABCD) == 0xABCD);
}

static void scenarioCloseIsIdempotent() {
	resetHardware();
	const core_spi::SpiBus bus = makeBus();

	bus.initialize();
	bus.setClockDivider(16);
	bus.beginTransaction(8, core_spi::SpiClockMode::MODE_1, core_spi::SpiBitOrder::LSB_FIRST);

	bus.close();
	CHECK(LL_SPI_IsEnabled(SPI1) == 0);
	CHECK(e95HostPinModeCallCount == 3);
	CHECK(e95HostLastPinMode == LL_GPIO_MODE_ANALOG);

	bus.close();
	CHECK(LL_SPI_IsEnabled(SPI1) == 0);
	CHECK(e95HostPinModeCallCount == 6);
	CHECK(e95HostLastPinMode == LL_GPIO_MODE_ANALOG);

	// close() drops the transaction stack, so the next transaction saves the
	// reset defaults instead of a stale pre-close snapshot.
	bus.beginTransaction(32, core_spi::SpiClockMode::MODE_2, core_spi::SpiBitOrder::LSB_FIRST);
	bus.endTransaction();
	CHECK((SPI1->CR1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV8);
	CHECK((SPI1->CR1 & SPI_CR1_LSBFIRST) == 0);
}

static void scenarioBeginTransactionWaitsForTransferComplete() {
	resetHardware();
	const core_spi::SpiBus bus = makeBus();

	bus.initialize();
	CHECK(e95SpiDisabledWhileBusyCount == 0);

	// A frame is still shifting when the transaction opens. beginTransaction
	// must drain BSY before turning SPE off, or it aborts the last frame.
	e95SpiBusyPollCount = 1;
	bus.beginTransaction(16, core_spi::SpiClockMode::MODE_3, core_spi::SpiBitOrder::LSB_FIRST);

	CHECK(e95SpiDisabledWhileBusyCount == 0);
	CHECK(e95SpiBusyPollCount == 0);
	CHECK(LL_SPI_IsEnabled(SPI1) != 0);
	CHECK((SPI1->CR1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV16);

	bus.endTransaction();
	CHECK((SPI1->CR1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV8);
	CHECK(e95SpiDisabledWhileBusyCount == 0);
}

static void scenarioTransfer16AndRestoreWaitForTransferComplete() {
	resetHardware();
	const core_spi::SpiBus bus = makeBus();

	bus.initialize();
	bus.beginTransaction(16, core_spi::SpiClockMode::MODE_3, core_spi::SpiBitOrder::LSB_FIRST);

	// The received byte is readable while the frame is still leaving the shift
	// register: transfer16 must drain BSY, and the following CR1 restore must
	// not disable the peripheral mid-frame either.
	e95SpiBusyPollCount = 2;
	CHECK(bus.transfer16(0x1234) == 0x1234);
	CHECK(e95SpiBusyPollCount == 0);

	bus.endTransaction();
	CHECK(e95SpiDisabledWhileBusyCount == 0);
	CHECK((SPI1->CR1 & SPI_CR1_BR) == LL_SPI_BAUDRATEPRESCALER_DIV8);
}

int main() {
	scenarioInitializeConfiguresDefaults();
	scenarioNestsTwoTransactionsAndRestoresExactly();
	scenarioBeginTransactionWaitsForTransferComplete();
	scenarioTransfer16AndRestoreWaitForTransferComplete();
	scenarioTransfer16FollowsConfiguredBitOrder();
	scenarioCloseIsIdempotent();

	if (failures == 0) {
		printf("SPI stm32 transaction: all scenarios passed\n");
		return 0;
	}
	printf("SPI stm32 transaction: %d check(s) failed\n", failures);
	return 1;
}
