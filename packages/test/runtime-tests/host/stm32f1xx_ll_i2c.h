#ifndef _E95_RUNTIME_HOST_STM32F1XX_LL_I2C_H
#define _E95_RUNTIME_HOST_STM32F1XX_LL_I2C_H
// Host stand-in for the STM32F1 LL I2C header. It models the register slice and
// the acknowledge flags the generated `core_i2c.cpp` touches, so the write
// transaction (address phase, data phase, address NACK, data NACK and the
// finish) can be exercised on the host instead of on a device. A scenario picks
// the phase that raises the acknowledge-failure flag through e95I2cNackPhase.
#include <stdint.h>

struct I2C_TypeDef {
	uint32_t CR1;
	uint32_t CR2;
	uint32_t OAR1;
	uint32_t OAR2;
	uint32_t CCR;
	uint32_t TRISE;
	uint32_t SR1;
	uint32_t SR2;
	uint32_t DR;
};

inline I2C_TypeDef e95I2c1Registers = {};
inline I2C_TypeDef e95I2c2Registers = {};

#define I2C1 (&e95I2c1Registers)
#define I2C2 (&e95I2c2Registers)

static const uint32_t LL_I2C_MODE_I2C = 0x00000000UL;
static const uint32_t LL_I2C_CLOCK_SPEED_STANDARD_MODE = 0x00000000UL;
static const uint32_t LL_I2C_CLOCK_SPEED_FAST_MODE = 0x00008000UL;
static const uint32_t LL_I2C_DUTYCYCLE_2 = 0x00000000UL;
static const uint32_t LL_I2C_OWNADDRESS1_7BIT = 0x00004000UL;
static const uint32_t LL_I2C_NACK = 0x00000000UL;
static const uint32_t LL_I2C_ACK = 0x00000400UL;
static const uint32_t LL_I2C_DIRECTION_WRITE = 0x00000004UL;
static const uint32_t LL_I2C_DIRECTION_READ = 0x00000000UL;

static const uint8_t E95_I2C_NACK_NONE = 0;
static const uint8_t E95_I2C_NACK_ADDRESS = 1;
static const uint8_t E95_I2C_NACK_DATA = 2;

static const uint8_t E95_I2C_PHASE_IDLE = 0;
static const uint8_t E95_I2C_PHASE_ADDRESS = 1;
static const uint8_t E95_I2C_PHASE_ADDRESS_ACKED = 2;
static const uint8_t E95_I2C_PHASE_DATA = 3;
static const uint8_t E95_I2C_PHASE_FAILED = 4;

static const uint32_t E95_I2C_SR1_ADDR = 0x00000002UL;
static const uint32_t E95_I2C_SR1_STOPF = 0x00000010UL;
static const uint32_t E95_I2C_SR1_RXNE = 0x00000040UL;
static const uint32_t E95_I2C_SR1_TXE = 0x00000080UL;
static const uint32_t E95_I2C_SR1_BERR = 0x00000100UL;
static const uint32_t E95_I2C_SR1_ARLO = 0x00000200UL;
static const uint32_t E95_I2C_SR1_AF = 0x00000400UL;
static const uint32_t E95_I2C_SR1_OVR = 0x00000800UL;
static const uint32_t E95_I2C_SR2_TRA = 0x00000004UL;

typedef int32_t IRQn_Type;

static const IRQn_Type I2C1_EV_IRQn = 31;
static const IRQn_Type I2C1_ER_IRQn = 32;
static const IRQn_Type I2C2_EV_IRQn = 33;
static const IRQn_Type I2C2_ER_IRQn = 34;

inline uint8_t e95I2cNackPhase = E95_I2C_NACK_NONE;
inline uint8_t e95I2cPhase = E95_I2C_PHASE_IDLE;
inline uint16_t e95I2cStartCount = 0;
inline uint16_t e95I2cStopCount = 0;
inline uint16_t e95I2cEnableCount = 0;
inline uint16_t e95I2cDisableCount = 0;
// Room for a full response plus the filler bytes a master keeps clocking after
// the slave response is exhausted.
static const uint16_t E95_I2C_HOST_TRANSMIT_CAPACITY = 64;

inline uint8_t e95I2cTransmittedAddress = 0;
inline uint16_t e95I2cTransmittedByteCount = 0;
inline uint8_t e95I2cTransmittedBytes[E95_I2C_HOST_TRANSMIT_CAPACITY] = {};

inline bool e95I2cSlaveMode = false;
inline uint32_t e95I2cSlaveSr1 = 0;
inline uint32_t e95I2cSlaveSr2 = 0;
inline uint8_t e95I2cSlaveReceivedByte = 0;
inline uint16_t e95I2cSlaveTransmittedByteCount = 0;
inline uint8_t e95I2cSlaveTransmittedBytes[E95_I2C_HOST_TRANSMIT_CAPACITY] = {};
inline uint32_t e95I2cOwnAddress1 = 0;
inline uint32_t e95I2cOwnAddressMode = 0;
inline uint32_t e95I2cLastAcknowledge = 0;
inline uint16_t e95I2cAcknowledgeCount = 0;
inline uint16_t e95I2cNegativeAcknowledgeCount = 0;
inline bool e95I2cEventInterruptsEnabled = false;
inline bool e95I2cBufferInterruptsEnabled = false;
inline bool e95I2cErrorInterruptsEnabled = false;
inline uint16_t e95I2cEnabledEventIrqCount = 0;
inline uint16_t e95I2cEnabledErrorIrqCount = 0;
inline uint16_t e95I2cDisabledEventIrqCount = 0;
inline uint16_t e95I2cDisabledErrorIrqCount = 0;

inline void LL_I2C_SetPeriphClock(I2C_TypeDef *i2c, uint32_t clock) {
	(void)i2c;
	(void)clock;
}

inline void LL_I2C_SetMode(I2C_TypeDef *i2c, uint32_t mode) {
	(void)i2c;
	(void)mode;
}

inline void LL_I2C_SetClockSpeedMode(I2C_TypeDef *i2c, uint32_t speedMode) {
	(void)i2c;
	(void)speedMode;
}

inline void LL_I2C_SetDutyCycle(I2C_TypeDef *i2c, uint32_t dutyCycle) {
	(void)i2c;
	(void)dutyCycle;
}

inline void LL_I2C_SetClockPeriod(I2C_TypeDef *i2c, uint32_t clockPeriod) {
	(void)i2c;
	(void)clockPeriod;
}

inline void LL_I2C_SetRiseTime(I2C_TypeDef *i2c, uint32_t riseTime) {
	(void)i2c;
	(void)riseTime;
}

inline void LL_I2C_SetOwnAddress1(
	I2C_TypeDef *i2c,
	uint32_t ownAddress,
	uint32_t addressingMode) {
	(void)i2c;
	e95I2cOwnAddress1 = ownAddress;
	e95I2cOwnAddressMode = addressingMode;
}

inline void LL_I2C_SetOwnAddress2(I2C_TypeDef *i2c, uint32_t ownAddress) {
	(void)i2c;
	(void)ownAddress;
}

inline void LL_I2C_DisableGeneralCall(I2C_TypeDef *i2c) {
	(void)i2c;
}

inline void LL_I2C_Enable(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cEnableCount++;
}

inline void LL_I2C_Disable(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cDisableCount++;
}

inline uint32_t LL_I2C_IsActiveFlag_BUSY(const I2C_TypeDef *i2c) {
	(void)i2c;
	return 0;
}

inline void LL_I2C_GenerateStartCondition(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cStartCount++;
	e95I2cPhase = E95_I2C_PHASE_ADDRESS;
}

inline uint32_t LL_I2C_IsActiveFlag_SB(const I2C_TypeDef *i2c) {
	(void)i2c;
	return 1;
}

inline uint32_t LL_I2C_IsActiveFlag_ADDR(const I2C_TypeDef *i2c) {
	(void)i2c;
	if (e95I2cSlaveMode) {
		return (e95I2cSlaveSr1 & E95_I2C_SR1_ADDR) != 0 ? 1 : 0;
	}
	return e95I2cPhase == E95_I2C_PHASE_ADDRESS_ACKED ? 1 : 0;
}

inline void LL_I2C_ClearFlag_ADDR(I2C_TypeDef *i2c) {
	(void)i2c;
	if (e95I2cSlaveMode) {
		e95I2cSlaveSr1 &= ~E95_I2C_SR1_ADDR;
		return;
	}
	e95I2cPhase = E95_I2C_PHASE_DATA;
}

inline uint32_t LL_I2C_IsActiveFlag_STOP(const I2C_TypeDef *i2c) {
	(void)i2c;
	return (e95I2cSlaveSr1 & E95_I2C_SR1_STOPF) != 0 ? 1 : 0;
}

inline void LL_I2C_ClearFlag_STOP(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cSlaveSr1 &= ~E95_I2C_SR1_STOPF;
}

inline uint32_t LL_I2C_IsActiveFlag_AF(const I2C_TypeDef *i2c) {
	(void)i2c;
	if (e95I2cSlaveMode) {
		return (e95I2cSlaveSr1 & E95_I2C_SR1_AF) != 0 ? 1 : 0;
	}
	return e95I2cPhase == E95_I2C_PHASE_FAILED ? 1 : 0;
}

inline void LL_I2C_ClearFlag_AF(I2C_TypeDef *i2c) {
	(void)i2c;
	if (e95I2cSlaveMode) {
		e95I2cSlaveSr1 &= ~E95_I2C_SR1_AF;
		return;
	}
	e95I2cPhase = E95_I2C_PHASE_IDLE;
}

inline uint32_t LL_I2C_IsActiveFlag_BERR(const I2C_TypeDef *i2c) {
	(void)i2c;
	return (e95I2cSlaveSr1 & E95_I2C_SR1_BERR) != 0 ? 1 : 0;
}

inline void LL_I2C_ClearFlag_BERR(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cSlaveSr1 &= ~E95_I2C_SR1_BERR;
}

inline uint32_t LL_I2C_IsActiveFlag_ARLO(const I2C_TypeDef *i2c) {
	(void)i2c;
	return (e95I2cSlaveSr1 & E95_I2C_SR1_ARLO) != 0 ? 1 : 0;
}

inline void LL_I2C_ClearFlag_ARLO(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cSlaveSr1 &= ~E95_I2C_SR1_ARLO;
}

inline uint32_t LL_I2C_IsActiveFlag_OVR(const I2C_TypeDef *i2c) {
	(void)i2c;
	return (e95I2cSlaveSr1 & E95_I2C_SR1_OVR) != 0 ? 1 : 0;
}

inline void LL_I2C_ClearFlag_OVR(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cSlaveSr1 &= ~E95_I2C_SR1_OVR;
}

inline uint32_t LL_I2C_IsActiveFlag_TXE(const I2C_TypeDef *i2c) {
	(void)i2c;
	if (e95I2cSlaveMode) {
		return (e95I2cSlaveSr1 & E95_I2C_SR1_TXE) != 0 ? 1 : 0;
	}
	return e95I2cPhase == E95_I2C_PHASE_DATA ? 1 : 0;
}

inline uint32_t LL_I2C_IsActiveFlag_BTF(const I2C_TypeDef *i2c) {
	(void)i2c;
	if (e95I2cSlaveMode) {
		return (e95I2cSlaveSr1 & E95_I2C_SR1_TXE) != 0 ? 1 : 0;
	}
	return e95I2cPhase == E95_I2C_PHASE_DATA ? 1 : 0;
}

inline uint32_t LL_I2C_IsActiveFlag_RXNE(const I2C_TypeDef *i2c) {
	(void)i2c;
	if (e95I2cSlaveMode) {
		return (e95I2cSlaveSr1 & E95_I2C_SR1_RXNE) != 0 ? 1 : 0;
	}
	return 1;
}

inline uint32_t LL_I2C_GetTransferDirection(const I2C_TypeDef *i2c) {
	(void)i2c;
	return e95I2cSlaveSr2 & E95_I2C_SR2_TRA;
}

inline void LL_I2C_TransmitData8(I2C_TypeDef *i2c, uint8_t data) {
	if (e95I2cSlaveMode) {
		i2c->DR = data;
		e95I2cSlaveTransmittedBytes[e95I2cSlaveTransmittedByteCount] = data;
		e95I2cSlaveTransmittedByteCount++;
		e95I2cSlaveSr1 &= ~E95_I2C_SR1_TXE;
		return;
	}
	i2c->DR = data;
	if (e95I2cPhase == E95_I2C_PHASE_ADDRESS) {
		e95I2cTransmittedAddress = data;
		if (e95I2cNackPhase == E95_I2C_NACK_ADDRESS) {
			e95I2cPhase = E95_I2C_PHASE_FAILED;
			return;
		}
		e95I2cPhase = E95_I2C_PHASE_ADDRESS_ACKED;
		return;
	}
	if (e95I2cPhase != E95_I2C_PHASE_DATA) {
		return;
	}
	e95I2cTransmittedBytes[e95I2cTransmittedByteCount] = data;
	e95I2cTransmittedByteCount++;
	if (e95I2cNackPhase == E95_I2C_NACK_DATA) {
		e95I2cPhase = E95_I2C_PHASE_FAILED;
	}
}

inline uint8_t LL_I2C_ReceiveData8(const I2C_TypeDef *i2c) {
	if (e95I2cSlaveMode) {
		e95I2cSlaveSr1 &= ~E95_I2C_SR1_RXNE;
		return e95I2cSlaveReceivedByte;
	}
	return (uint8_t)i2c->DR;
}

inline void LL_I2C_AcknowledgeNextData(I2C_TypeDef *i2c, uint32_t acknowledge) {
	(void)i2c;
	e95I2cLastAcknowledge = acknowledge;
	if (acknowledge == LL_I2C_ACK) {
		e95I2cAcknowledgeCount++;
		return;
	}
	e95I2cNegativeAcknowledgeCount++;
}

inline void LL_I2C_EnableIT_EVT(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cEventInterruptsEnabled = true;
}

inline void LL_I2C_DisableIT_EVT(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cEventInterruptsEnabled = false;
}

inline void LL_I2C_EnableIT_BUF(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cBufferInterruptsEnabled = true;
}

inline void LL_I2C_DisableIT_BUF(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cBufferInterruptsEnabled = false;
}

inline void LL_I2C_EnableIT_ERR(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cErrorInterruptsEnabled = true;
}

inline void LL_I2C_DisableIT_ERR(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cErrorInterruptsEnabled = false;
}

inline void LL_I2C_EnableIT_TX(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cEventInterruptsEnabled = true;
	e95I2cBufferInterruptsEnabled = true;
}

inline void LL_I2C_DisableIT_TX(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cEventInterruptsEnabled = false;
	e95I2cBufferInterruptsEnabled = false;
}

inline void LL_I2C_EnableIT_RX(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cEventInterruptsEnabled = true;
	e95I2cBufferInterruptsEnabled = true;
}

inline void LL_I2C_DisableIT_RX(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cEventInterruptsEnabled = false;
	e95I2cBufferInterruptsEnabled = false;
}

inline void NVIC_EnableIRQ(IRQn_Type interrupt) {
	if (interrupt == I2C1_EV_IRQn || interrupt == I2C2_EV_IRQn) {
		e95I2cEnabledEventIrqCount++;
		return;
	}
	if (interrupt == I2C1_ER_IRQn || interrupt == I2C2_ER_IRQn) {
		e95I2cEnabledErrorIrqCount++;
	}
}

inline void NVIC_DisableIRQ(IRQn_Type interrupt) {
	if (interrupt == I2C1_EV_IRQn || interrupt == I2C2_EV_IRQn) {
		e95I2cDisabledEventIrqCount++;
		return;
	}
	if (interrupt == I2C1_ER_IRQn || interrupt == I2C2_ER_IRQn) {
		e95I2cDisabledErrorIrqCount++;
	}
}

inline void LL_I2C_GenerateStopCondition(I2C_TypeDef *i2c) {
	(void)i2c;
	e95I2cStopCount++;
	e95I2cPhase = E95_I2C_PHASE_IDLE;
}

#endif
