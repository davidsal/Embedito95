// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct Point {
	i16 x;
	i16 y;
};

struct Pack {
	core_string::String name;
	core_array::Array<i16> counts;
	core_array::Array<core_object::Object<Point>> coords;
};

inline void _e95Trace_Pack(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<Pack> *typed = (core_mem::RefBox<Pack> *)box;
	Pack *value = &typed->value;
	value->counts.traceChild(visit);
	value->coords.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<Pack> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<Pack>,
			&_e95Trace_Pack,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

void first(core_object::Object<Pack> p) {
	serial.sendLine(p->coords[0]->x);
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Pack> a = core_object::Object<Pack>(Pack{ F("p"), core_array::Array<i16>(1, 2, 3), core_array::Array<core_object::Object<Point>>(core_object::Object<Point>(Point{ 4, 5 }), core_object::Object<Point>(Point{ 6, 7 })) });
	serial.sendLine(a->counts[0]);
	serial.sendLine(a->coords[0]->x);
	serial.sendLine(a->coords[1]->y);

	a->counts[0] = a->counts[0] + (i16)(10);
	serial.sendLine(a->counts[0]);
	core_object::Object<Pack> b = a;
	b->coords[0]->x = 99;
	serial.sendLine(a->coords[0]->x);
	serial.sendLine(b->coords[0]->x);

	first(a);
	serial.sendLine(a->coords[0]->x);
	serial.sendLine(a->name);
}

void loop() {
}
