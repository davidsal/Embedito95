// Cost measurement translation unit for the E95_CYCLES collector.
//
// Compile it twice (E95_CYCLES=0 and =1) and compare `text`/`data`/`bss` with
// the platform's size tool. The payload is a two-node cycle with one handle
// field, so the delta is the collector itself: the mark/scan/restore passes,
// the candidate bookkeeping inlined into release/allocate, and the fixed
// CycleCollector singleton. See docs/engine.md ("Measured cost").
//
// Host (Apple clang++):
//   clang++ -std=c++11 -Os -fno-exceptions -fno-rtti -DE95_CYCLES=0 -o off measure.cpp
//   clang++ -std=c++11 -Os -fno-exceptions -fno-rtti -DE95_CYCLES=1 -o on  measure.cpp
//   size -m off on
//
// AVR (Arduino toolchain, from the repository root):
//   AVR=~/Library/Arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin
//   $AVR/avr-g++ -c -Os -std=gnu++11 -fno-exceptions -fno-rtti -mmcu=atmega328p \
//     -DE95_CYCLES=0 -I . -o off.o packages/test/runtime-tests/measure/measure.cpp
//   $AVR/avr-g++ -c -Os -std=gnu++11 -fno-exceptions -fno-rtti -mmcu=atmega328p \
//     -DE95_CYCLES=1 -I . -o on.o packages/test/runtime-tests/measure/measure.cpp
//   $AVR/avr-size off.o on.o
//   (repeat with -mmcu=attiny85 for the ATtiny85 figures)

#include "packages/registry/src/strategies/shared/memory/ref.h"

#include <stdint.h>

using core_mem::Ref;
using core_mem::RefBox;
using core_mem::TraceVisitor;
using core_mem::TypeInfo;

struct Node {
	Ref<Node> next;
	uint16_t value;
};

static void traceNode(void *box, TraceVisitor visit) {
	RefBox<Node> *typed = (RefBox<Node> *)box;
	typed->value.next.traceChild(visit);
}

static const TypeInfo NODE_TYPE = {&core_mem::destroyRefBox<Node>, &traceNode};

namespace core_mem {

template <>
struct TypeInfoOf<::Node> {
	static const TypeInfo *get() noexcept {
		return &NODE_TYPE;
	}
};

} // namespace core_mem

static volatile uint16_t result;

int main() {
	Ref<Node> first = Ref<Node>::emplace();
	Ref<Node> second = Ref<Node>::emplace();
	first->next = second;
	second->next = first;
	first.reset();
	second.reset();
	core_mem::collectCycles();
	result = 1;
	return 0;
}
