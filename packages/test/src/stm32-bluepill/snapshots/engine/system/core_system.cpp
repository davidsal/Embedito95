#include "stm32f1xx_ll_rcc.h"
#include "stm32f1xx_ll_system.h"
#include "stm32f1xx_ll_utils.h"
#include <errno.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include "core_system.h"

extern char _ebss;
extern char _estack;

static char *heapEnd = &_ebss;

extern "C" caddr_t _sbrk(int increment) {
	caddr_t previous = heapEnd;
	if (heapEnd + increment > &_estack) {
		errno = ENOMEM;
		return (caddr_t)-1;
	}
	heapEnd += increment;
	return previous;
}

namespace core_system {

u16 getFreeHeap() {
	char top;
	char *stackTop = &top;
	return stackTop - heapEnd;
}

}

void initializeSystemClock() {
	// HSE 8MHz → PLL ×9 → 72000000MHz
	LL_FLASH_SetLatency(LL_FLASH_LATENCY_2);
	LL_RCC_HSE_Enable();
	while (!LL_RCC_HSE_IsReady());
	LL_RCC_PLL_ConfigDomain_SYS(LL_RCC_PLLSOURCE_HSE_DIV_1, LL_RCC_PLL_MUL_9);
	LL_RCC_PLL_Enable();
	while (!LL_RCC_PLL_IsReady());
	RCC->CFGR = (RCC->CFGR & ~RCC_CFGR_SW) | RCC_CFGR_SW_PLL;
	while ((RCC->CFGR & RCC_CFGR_SWS) != RCC_CFGR_SWS_PLL);
	LL_SetSystemCoreClock(72000000);

	// Reset the free-running cycle counter (not cleared by NRST) so time() starts at 0 on reset.
	CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
	DWT->CTRL &= ~DWT_CTRL_CYCCNTENA_Msk;
	DWT->CYCCNT = 0;
	DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
}
