// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct Cfg {
	i16 pin;
	core_string::String label;
	nullable<boolean> isValid;
};

struct Bound {
	core_object::Object<Cfg> cfg;
};

inline void _e95Trace_Bound(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<Bound> *typed = (core_mem::RefBox<Bound> *)box;
	Bound *value = &typed->value;
	value->cfg.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<Bound> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<Bound>,
			&_e95Trace_Bound,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

i16 readPin(core_object::Object<Bound> &self);
core_string::String readLabel(core_object::Object<Bound> &self);

i16 readPin(core_object::Object<Bound> &self) {
	return self->cfg->pin;
}

core_string::String readLabel(core_object::Object<Bound> &self) {
	return self->cfg->label;
}

core_object::Object<Bound> makeBound(core_object::Object<Cfg> cfg) {
	return core_object::Object<Bound>(Bound{ cfg });
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Cfg> cfg = core_object::Object<Cfg>(Cfg{ 7, F("x"), nullable<boolean>{ false, true } });
	core_object::Object<Bound> bound = makeBound(cfg);
	serial.sendLine(readPin(bound));
	serial.sendLine(readLabel(bound));
}

void loop() {
}
