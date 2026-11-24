// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct _makeRectReturn1 {
	i8 x;
	i8 y;
};

struct _makeRectReturn {
	core_object::Object<_makeRectReturn1> origin;
	i8 w;
	i8 h;
};

inline void _e95Trace__makeRectReturn(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<_makeRectReturn> *typed = (core_mem::RefBox<_makeRectReturn> *)box;
	_makeRectReturn *value = &typed->value;
	value->origin.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<_makeRectReturn> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<_makeRectReturn>,
			&_e95Trace__makeRectReturn,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

core_object::Object<_makeRectReturn> makeRect() {
	core_object::Object<_makeRectReturn1> origin = core_object::Object<_makeRectReturn1>(_makeRectReturn1{ 0, 0 });
	return core_object::Object<_makeRectReturn>(_makeRectReturn{ origin, 10, 20 });
}

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<_makeRectReturn> rect = makeRect();
	core_object::Object<_makeRectReturn> copy = rect;
	rect->origin->x = 99;
	rect->origin->y = 88;

	serial.sendLine(rect->origin->x);
	serial.sendLine(rect->origin->y);
	serial.sendLine(copy->origin->x);
	serial.sendLine(rect->w);
	serial.sendLine(rect->h);
	core_object::Object<_makeRectReturn> other = makeRect();
	other->origin->x = 1;
	serial.sendLine(other->origin->x);
	serial.sendLine(rect->origin->x);
}
