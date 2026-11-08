// CORE
#include "core/serial/core_serial.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"

struct Cfg {
	i16 pin;
	core_string::String label;
	nullable<boolean> isValid;
};

struct Bound {
	core_object::Object<Cfg> cfg;
};

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

int main() {
	// SETUP
	initializeSystemClock();
	serial.initialize(9600);

	// MAIN
	core_object::Object<Cfg> cfg = core_object::Object<Cfg>(Cfg{ 7, "x", nullable<boolean>{ false, true } });
	core_object::Object<Bound> bound = makeBound(cfg);
	serial.sendLine(readPin(bound));
	serial.sendLine(readLabel(bound));
}
