// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct Handler {
	void (*onEvent)(i16);
};

struct Adder {
	i16 (*add)(i16, i16);
};

struct Outer {
	core_object::Object<Handler> handler;
};

inline void _e95Trace_Outer(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<Outer> *typed = (core_mem::RefBox<Outer> *)box;
	Outer *value = &typed->value;
	value->handler.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<Outer> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<Outer>,
			&_e95Trace_Outer,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void printValue(i16 value) {
	serial.sendLine(value);
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<Handler> inlineHandler = core_object::Object<Handler>(Handler{ [](i16 value) -> void {
		serial.sendLine(((i32)(value) + (i32)(1)));
	} });
	inlineHandler->onEvent(10);
	core_object::Object<Handler> delegating = core_object::Object<Handler>(Handler{ [](i16 value) -> void {
		printValue(((i32)(value) + (i32)(2)));
	} });
	delegating->onEvent(20);
	inlineHandler->onEvent = printValue;
	inlineHandler->onEvent(30);
	core_object::Object<Adder> adder = core_object::Object<Adder>(Adder{ [](i16 a, i16 b) -> i16 {
		return (i32)(a) + (i32)(b);
	} });
	serial.sendLine(adder->add(2, 3));
	core_object::Object<Outer> outer = core_object::Object<Outer>(Outer{ core_object::Object<Handler>(Handler{ [](i16 value) -> void {
		printValue(((i32)(value) + (i32)(4)));
	} }) });
	outer->handler->onEvent(40);
}
