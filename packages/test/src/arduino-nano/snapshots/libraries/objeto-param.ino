// CORE
#include <core_serial.h>
#include <core_system.h>
#include <core_type.h>
#include <core_time.h>

struct Response {
	i16 type;
	i16 from;
};

struct Box {
	i16 value;
};

struct Twiddler {
	i16 (*twiddle)(core_object::Object<Box>);
};

core_serial::SerialPort serial = core_serial::getSerial(core_serial::Serial::SERIAL_1);

i16 twiddle(core_object::Object<Box> b);

i16 twiddle(core_object::Object<Box> b) {
	b = core_object::Object<Box>(Box{ 99 });
	return b->value;
}

core_object::Object<Twiddler> makeTwiddler() {
	return core_object::Object<Twiddler>(Twiddler{ twiddle });
}

i16 parseResponse(i16 type, core_object::Object<Response> data) {
	data = core_object::Object<Response>(Response{ type, (type + (i16)(1)) });
	return data->type + data->from;
}

void setup() {
	// SETUP
	serial.initialize(9600);

	// MAIN
	core_object::Object<Response> r = core_object::Object<Response>(Response{ 1, 2 });
	const i16 viaFree = parseResponse(5, r);
	serial.sendLine(r->type);
	serial.sendLine(r->from);
	serial.sendLine(viaFree);

	core_object::Object<Box> box = core_object::Object<Box>(Box{ 3 });
	core_object::Object<Twiddler> tw = makeTwiddler();
	const i16 viaMethod = tw->twiddle(box);
	serial.sendLine(box->value);
	serial.sendLine(viaMethod);
}

void loop() {
}
