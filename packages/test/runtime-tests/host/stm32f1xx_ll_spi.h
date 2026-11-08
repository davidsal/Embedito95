#ifndef _E95_RUNTIME_HOST_STM32F1XX_LL_SPI_H
#define _E95_RUNTIME_HOST_STM32F1XX_LL_SPI_H
// Host stand-in for the STM32F1 LL SPI header. It models only the register
// slice the generated `core_spi.cpp` touches, so the transaction save/restore
// logic can be exercised on the host against real register writes. The F1 SPI
// peripheral has no BRR register: the baud-rate prescaler lives in CR1.BR[2:0],
// and these stand-ins keep that layout so a regression to a non-existent
// register fails to compile here too.
#include <stdint.h>

// CR1 bits used by the generated driver.
static const uint32_t SPI_CR1_CPHA = 0x00000001UL;
static const uint32_t SPI_CR1_CPOL = 0x00000002UL;
static const uint32_t SPI_CR1_MSTR = 0x00000004UL;
static const uint32_t SPI_CR1_BR = 0x00000038UL;
static const uint32_t SPI_CR1_SPE = 0x00000040UL;
static const uint32_t SPI_CR1_LSBFIRST = 0x00000080UL;
static const uint32_t SPI_CR1_SSI = 0x00000100UL;
static const uint32_t SPI_CR1_SSM = 0x00000200UL;
static const uint32_t SPI_CR1_RXONLY = 0x00000400UL;
static const uint32_t SPI_CR1_DFF = 0x00000800UL;
static const uint32_t SPI_CR1_BIDIOE = 0x00004000UL;
static const uint32_t SPI_CR1_BIDIMODE = 0x00008000UL;

// SR bits used by the generated driver.
static const uint32_t SPI_SR_RXNE = 0x00000001UL;
static const uint32_t SPI_SR_TXE = 0x00000002UL;
static const uint32_t SPI_SR_BSY = 0x00000080UL;

// Host model of an in-flight frame. Each BSY poll consumes one unit of shift
// time, so the generated wait loops drain the counter (and cannot hang on the
// host). Disabling the peripheral while the counter is non-zero models
// aborting the last frame, which the regression test observes.
inline uint32_t e95SpiBusyPollCount = 0;
inline uint32_t e95SpiDisabledWhileBusyCount = 0;

struct SPI_TypeDef {
	uint32_t CR1;
	uint32_t CR2;
	uint32_t SR;
	uint32_t DR;
};

inline SPI_TypeDef e95Spi1Registers = {};
inline SPI_TypeDef e95Spi2Registers = {};

#define SPI1 (&e95Spi1Registers)
#define SPI2 (&e95Spi2Registers)

static const uint32_t LL_SPI_MODE_MASTER = 0x00000004UL;
static const uint32_t LL_SPI_NSS_SOFT = 0x00000200UL;
static const uint32_t LL_SPI_DATAWIDTH_8BIT = 0x00000000UL;
static const uint32_t LL_SPI_MSB_FIRST = 0x00000000UL;
static const uint32_t LL_SPI_LSB_FIRST = 0x00000080UL;
static const uint32_t LL_SPI_FULL_DUPLEX = 0x00000000UL;
static const uint32_t LL_SPI_POLARITY_LOW = 0x00000000UL;
static const uint32_t LL_SPI_POLARITY_HIGH = 0x00000002UL;
static const uint32_t LL_SPI_PHASE_1EDGE = 0x00000000UL;
static const uint32_t LL_SPI_PHASE_2EDGE = 0x00000001UL;

static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV2 = 0x00000000UL;
static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV4 = 0x00000008UL;
static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV8 = 0x00000010UL;
static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV16 = 0x00000018UL;
static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV32 = 0x00000020UL;
static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV64 = 0x00000028UL;
static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV128 = 0x00000030UL;
static const uint32_t LL_SPI_BAUDRATEPRESCALER_DIV256 = 0x00000038UL;

inline void LL_SPI_SetMode(SPI_TypeDef *spi, uint32_t mode) {
	spi->CR1 = (spi->CR1 & ~SPI_CR1_MSTR) | mode;
}

inline void LL_SPI_SetNSSMode(SPI_TypeDef *spi, uint32_t mode) {
	spi->CR1 = (spi->CR1 & ~SPI_CR1_SSM) | mode;
}

inline void LL_SPI_SetDataWidth(SPI_TypeDef *spi, uint32_t width) {
	spi->CR1 = (spi->CR1 & ~SPI_CR1_DFF) | width;
}

inline void LL_SPI_SetTransferBitOrder(SPI_TypeDef *spi, uint32_t bitOrder) {
	spi->CR1 = (spi->CR1 & ~SPI_CR1_LSBFIRST) | bitOrder;
}

inline void LL_SPI_SetTransferDirection(SPI_TypeDef *spi, uint32_t direction) {
	spi->CR1 = (spi->CR1 & ~(SPI_CR1_BIDIMODE | SPI_CR1_RXONLY)) | direction;
}

inline void LL_SPI_SetClockPolarity(SPI_TypeDef *spi, uint32_t polarity) {
	spi->CR1 = (spi->CR1 & ~SPI_CR1_CPOL) | polarity;
}

inline void LL_SPI_SetClockPhase(SPI_TypeDef *spi, uint32_t phase) {
	spi->CR1 = (spi->CR1 & ~SPI_CR1_CPHA) | phase;
}

inline void LL_SPI_SetBaudRatePrescaler(SPI_TypeDef *spi, uint32_t prescaler) {
	spi->CR1 = (spi->CR1 & ~SPI_CR1_BR) | prescaler;
}

inline void LL_SPI_Enable(SPI_TypeDef *spi) {
	spi->CR1 |= SPI_CR1_SPE;
}

inline void LL_SPI_Disable(SPI_TypeDef *spi) {
	if (e95SpiBusyPollCount > 0) {
		e95SpiDisabledWhileBusyCount++;
	}
	spi->CR1 &= ~SPI_CR1_SPE;
}

inline uint32_t LL_SPI_IsEnabled(const SPI_TypeDef *spi) {
	return spi->CR1 & SPI_CR1_SPE;
}

inline uint32_t LL_SPI_IsActiveFlag_TXE(const SPI_TypeDef *spi) {
	(void)spi;
	return 1;
}

inline uint32_t LL_SPI_IsActiveFlag_RXNE(const SPI_TypeDef *spi) {
	(void)spi;
	return 1;
}

inline uint32_t LL_SPI_IsActiveFlag_BSY(const SPI_TypeDef *spi) {
	(void)spi;
	if (e95SpiBusyPollCount == 0) {
		return 0;
	}
	e95SpiBusyPollCount--;
	return 1;
}

inline void LL_SPI_TransmitData8(SPI_TypeDef *spi, uint8_t data) {
	spi->DR = data;
}

inline uint8_t LL_SPI_ReceiveData8(const SPI_TypeDef *spi) {
	return (uint8_t)spi->DR;
}

#endif
