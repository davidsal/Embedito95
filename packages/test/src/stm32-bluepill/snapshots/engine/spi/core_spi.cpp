#include "stm32f1xx_ll_bus.h"
#include "stm32f1xx_ll_gpio.h"
#include "stm32f1xx_ll_spi.h"
#include "core_spi.h"
#include "../gpio/core_gpio.h"

namespace core_spi {

static void _e95_enableSpiClock(SPI_TypeDef *spi) {
	if (spi == SPI1) { LL_APB2_GRP1_EnableClock(LL_APB2_GRP1_PERIPH_SPI1); } else
	if (spi == SPI2) { LL_APB1_GRP1_EnableClock(LL_APB1_GRP1_PERIPH_SPI2); } else
	{ }
}

// Leaves a pin in its inactive state: analog input draws no current and does
// not drive the bus after the peripheral is disabled.
static void setPinInactive(core_gpio::Pin pin) {
	LL_GPIO_SetPinMode(
		core_gpio::_e95_pinPort(pin),
		core_gpio::_e95_pinMask(pin),
		LL_GPIO_MODE_ANALOG);
}

// The baud-rate prescaler lives in CR1.BR[2:0] on STM32F1, so saving CR1
// captures it; there is no separate BRR register to save.
static void saveSettings(SpiSavedSettings *saved, SPI_TypeDef *handle, SpiBitOrder bitOrder) {
	saved->controlRegister1 = handle->CR1;
	saved->controlRegister2 = handle->CR2;
	saved->bitOrder = bitOrder;
}

// Rewriting CR1 while a frame is still shifting corrupts the transfer. BSY
// clears once the last bit has left the bus, after RXNE is already set.
static void waitForTransferComplete(SPI_TypeDef *handle) {
	while (LL_SPI_IsActiveFlag_BSY(handle));
}

// Disabling SPE while a frame is shifting aborts that frame. Every path that
// turns the peripheral off drains the shift register first.
static void disableAfterTransferComplete(SPI_TypeDef *handle) {
	waitForTransferComplete(handle);
	if (LL_SPI_IsEnabled(handle)) {
		LL_SPI_Disable(handle);
	}
}

static void restoreSettings(const SpiSavedSettings &saved, SPI_TypeDef *handle) {
	disableAfterTransferComplete(handle);
	handle->CR1 = saved.controlRegister1;
	handle->CR2 = saved.controlRegister2;
}

void SpiBus::initialize() const {
	_e95_enableSpiClock(body_->handle);

	core_gpio::_e95_setPinAlternate(body_->sck);
	core_gpio::_e95_setPinAlternate(body_->mosi);
	core_gpio::_e95_setPinAlternate(body_->miso);

	LL_SPI_SetMode(body_->handle, LL_SPI_MODE_MASTER);
	LL_SPI_SetNSSMode(body_->handle, LL_SPI_NSS_SOFT);
	LL_SPI_SetDataWidth(body_->handle, LL_SPI_DATAWIDTH_8BIT);
	LL_SPI_SetTransferBitOrder(body_->handle, LL_SPI_MSB_FIRST);
	LL_SPI_SetTransferDirection(body_->handle, LL_SPI_FULL_DUPLEX);
	LL_SPI_SetClockPolarity(body_->handle, LL_SPI_POLARITY_LOW);
	LL_SPI_SetClockPhase(body_->handle, LL_SPI_PHASE_1EDGE);
	LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV8);
	body_->bitOrder = SpiBitOrder::MSB_FIRST;
	body_->transactionDepth = 0;
	LL_SPI_Enable(body_->handle);
}

void SpiBus::close() const {
	disableAfterTransferComplete(body_->handle);
	setPinInactive(body_->sck);
	setPinInactive(body_->mosi);
	setPinInactive(body_->miso);
	// Reset the hardware bit order alongside the tracked field so a later
	// transfer16 cannot split its bytes for a direction the shift register is
	// not using.
	LL_SPI_SetTransferBitOrder(body_->handle, LL_SPI_MSB_FIRST);
	body_->bitOrder = SpiBitOrder::MSB_FIRST;
	body_->transactionDepth = 0;
}

void SpiBus::setClockDivider(u16 divider) const {
	switch (divider) {
		case spi_detail::CLOCK_DIVISOR_2: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV2);
			break;
		}
		case spi_detail::CLOCK_DIVISOR_4: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV4);
			break;
		}
		case spi_detail::CLOCK_DIVISOR_16: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV16);
			break;
		}
		case spi_detail::CLOCK_DIVISOR_32: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV32);
			break;
		}
		case spi_detail::CLOCK_DIVISOR_64: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV64);
			break;
		}
		case spi_detail::CLOCK_DIVISOR_128: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV128);
			break;
		}
		case spi_detail::CLOCK_DIVISOR_256: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV256);
			break;
		}
		default: {
			LL_SPI_SetBaudRatePrescaler(body_->handle, LL_SPI_BAUDRATEPRESCALER_DIV8);
			break;
		}
	}
}

void SpiBus::setBitOrder(SpiBitOrder order) const {
	const u32 bitOrder = (order == SpiBitOrder::MSB_FIRST) ? LL_SPI_MSB_FIRST : LL_SPI_LSB_FIRST;
	body_->bitOrder = order;
	LL_SPI_SetTransferBitOrder(body_->handle, bitOrder);
}

void SpiBus::setClockMode(SpiClockMode mode) const {
	u32 polarity = LL_SPI_POLARITY_LOW;
	u32 phase = LL_SPI_PHASE_1EDGE;

	switch (mode) {
		case SpiClockMode::MODE_1: {
			phase = LL_SPI_PHASE_2EDGE;
			break;
		}
		case SpiClockMode::MODE_2: {
			polarity = LL_SPI_POLARITY_HIGH;
			break;
		}
		case SpiClockMode::MODE_3: {
			polarity = LL_SPI_POLARITY_HIGH;
			phase = LL_SPI_PHASE_2EDGE;
			break;
		}
		default: {
			break;
		}
	}

	LL_SPI_SetClockPolarity(body_->handle, polarity);
	LL_SPI_SetClockPhase(body_->handle, phase);
}

void SpiBus::beginTransaction(u16 clockDivider, SpiClockMode mode, SpiBitOrder bitOrder) const {
	if (body_->transactionDepth >= spi_detail::TRANSACTION_DEPTH_CAPACITY) {
		return;
	}

	saveSettings(&body_->savedSettings[body_->transactionDepth], body_->handle, body_->bitOrder);
	body_->transactionDepth++;

	// Reconfiguring CR1 requires SPE off, but a frame may still be shifting.
	const bool wasEnabled = LL_SPI_IsEnabled(body_->handle);
	if (wasEnabled) {
		disableAfterTransferComplete(body_->handle);
	}
	setClockDivider(clockDivider);
	setClockMode(mode);
	setBitOrder(bitOrder);
	if (wasEnabled) {
		LL_SPI_Enable(body_->handle);
	}
}

void SpiBus::endTransaction() const {
	if (body_->transactionDepth == 0) {
		return;
	}

	body_->transactionDepth--;
	const SpiSavedSettings &saved = body_->savedSettings[body_->transactionDepth];
	restoreSettings(saved, body_->handle);
	body_->bitOrder = saved.bitOrder;
}

u8 SpiBus::transfer(u8 data) const {
	while (!LL_SPI_IsActiveFlag_TXE(body_->handle));
	LL_SPI_TransmitData8(body_->handle, data);
	while (!LL_SPI_IsActiveFlag_RXNE(body_->handle));
	return LL_SPI_ReceiveData8(body_->handle);
}

u16 SpiBus::transfer16(u16 value) const {
	const u16 received = spi_detail::transferWord(
		*this,
		value,
		body_->bitOrder == SpiBitOrder::LSB_FIRST);
	// RXNE signals the received byte is readable, not that the frame has left
	// the shift register. Wait for BSY so a following CR1 restore is safe.
	waitForTransferComplete(body_->handle);
	return received;
}

core_array::Array<u8> SpiBus::transferBuffer(const core_array::Array<u8> &data) const {
	core_array::Array<u8> received;
	spi_detail::transferBytes(*this, data, &received);
	return received;
}

void SpiBus::write(const core_array::Array<u8> &data) const {
	core_array::Array<u8> *discard = nullptr;
	spi_detail::transferBytes(*this, data, discard);
}

SpiBus getSPI(SPI selector) {
	switch (selector) {
		case SPI::SPI_1: {
			static SpiBus bus(SPI1, core_gpio::Pin::PIN_A5, core_gpio::Pin::PIN_A7, core_gpio::Pin::PIN_A6);
			return bus;
		}
		case SPI::SPI_2: {
			static SpiBus bus(SPI2, core_gpio::Pin::PIN_B13, core_gpio::Pin::PIN_B15, core_gpio::Pin::PIN_B14);
			return bus;
		}
		default:
			return SpiBus();
	}
}

} // namespace core_spi
