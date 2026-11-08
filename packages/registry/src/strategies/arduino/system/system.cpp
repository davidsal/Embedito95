#include <stdlib.h>
#include <avr/pgmspace.h>
#include "core_system.h"

extern unsigned int __heap_start;
extern void *__brkval;

namespace core_system {

_e95_replace_freeHeapType getFreeHeap() {
	char top;
	char *stackTop = &top;
	char *heapTop = __brkval ? (char *)__brkval : (char *)&__heap_start;
	return stackTop - heapTop;
}

}
