#ifndef _E95_RUNTIME_HOST_STM32F1XX_LL_UTILS_H
#define _E95_RUNTIME_HOST_STM32F1XX_LL_UTILS_H
// Host stand-in for the STM32F1 LL utils header. It carries the CMSIS core
// pieces the SoftwareSerial transmit path touches (the DWT cycle counter and
// the PRIMASK interrupt gate) so the driver compiles untouched on the host. The
// test never sends a byte, so the counter reads are inert.
#include <stdint.h>

struct CoreDebug_TypeDef {
	uint32_t DEMCR;
};

inline CoreDebug_TypeDef e95CoreDebugRegisters = {};
#define CoreDebug (&e95CoreDebugRegisters)

static const uint32_t CoreDebug_DEMCR_TRCENA_Msk = 0x01000000UL;

struct DWT_TypeDef {
	uint32_t CTRL;
	uint32_t CYCCNT;
	uint32_t reserved;
};

inline DWT_TypeDef e95DwtRegisters = {};
#define DWT (&e95DwtRegisters)

static const uint32_t DWT_CTRL_CYCCNTENA_Msk = 0x00000001UL;

inline uint32_t __get_PRIMASK() {
	return 0;
}

inline void __set_PRIMASK(uint32_t primask) {
	(void)primask;
}

inline void __disable_irq() {}

#endif
