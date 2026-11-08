// CORE
#include "core/system/core_system.h"
#include "core/type/core_type.h"

struct Counter {
	i16 current;
};

struct Reader {
	core_object::Object<Counter> counter;
};

struct Box {
	core_object::Object<Counter> counter;
};

struct Screen {
	core_object::Object<Counter> writer;
};

i16 value(core_object::Object<Counter> &self);
void increment(core_object::Object<Counter> &self);
i16 read(core_object::Object<Reader> &self);
void bump(core_object::Object<Reader> &self);
void paint(core_object::Object<Screen> &self);

i16 value(core_object::Object<Counter> &self) {
	return self->current;
}

void increment(core_object::Object<Counter> &self) {
	self->current = (i16)((i32)(self->current) + (i32)(1));
}

i16 read(core_object::Object<Reader> &self) {
	return value(self->counter);
}

void bump(core_object::Object<Reader> &self) {
	increment(self->counter);
}

void paint(core_object::Object<Screen> &self) {
	increment(self->writer);
}

core_object::Object<Counter> makeCounter(i16 start) {
	return core_object::Object<Counter>(Counter{ start });
}

core_object::Object<Reader> makeReader(core_object::Object<Counter> counter) {
	return core_object::Object<Reader>(Reader{ counter });
}

core_object::Object<Screen> makeScreen(core_object::Object<Counter> writer) {
	return core_object::Object<Screen>(Screen{ writer });
}

i16 readIdentifier(core_object::Object<Counter> counter) {
	return value(counter);
}

i16 readCall() {
	return ([&]() { auto _e95_receiver_60_12 = makeCounter(5); return value(_e95_receiver_60_12); })();
}

i16 readParen(core_object::Object<Counter> counter) {
	return value((counter));
}

i16 readBox(core_object::Object<Box> box) {
	return value(box->counter);
}

i16 readChosen(core_object::Object<Counter> first, core_object::Object<Counter> second, boolean flag) {
	return value((flag ? first : second));
}

i16 readCast() {
	return ([&]() { auto _e95_receiver_76_12 = makeCounter(9); return value(_e95_receiver_76_12); })();
}

void incrementCast(core_object::Object<Counter> counter) {
	([&]() { auto _e95_receiver_82_5 = counter; return increment(_e95_receiver_82_5); })();
}

int main() {
	// SETUP
	initializeSystemClock();
	core_object::Object<Counter> counter = makeCounter(3);
	core_object::Object<Reader> reader = makeReader(counter);
	core_object::Object<Box> box = core_object::Object<Box>(Box{ makeCounter(7) });
	core_object::Object<Screen> screen = makeScreen(counter);
	increment(box->counter);
	paint(screen);
	incrementCast(counter);
	readIdentifier(counter);
	readCall();
	readParen(counter);
	readBox(box);
	readChosen(counter, box->counter, true);
	readCast();
	read(reader);
	bump(reader);

	// MAIN

}
