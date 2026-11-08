// CORE
#include <core_system.h>
#include <core_type.h>

struct Writer {
	void (*write)(i16);
};

struct Screen {
	core_object::Object<Writer> writer;
};

struct MappedScreen {
	core_object::Object<Writer> writer;
};

struct CollisionScreen {
	core_object::Object<Writer> writer;
};

struct StatelessScreen {
	void (*paint)();
};

struct PrivateScreen {
	core_object::Object<Writer> writer;
};

void paint(core_object::Object<Screen> &self);
void paint(core_object::Object<MappedScreen> &self);
void paint(core_object::Object<CollisionScreen> &self);
void paintPrivateClosure(core_object::Object<CollisionScreen> &self);
void paint();
void paint(core_object::Object<PrivateScreen> &self);
void notify(core_object::Object<PrivateScreen> &self);

void paint(core_object::Object<Screen> &self) {
	self->writer->write(1);
}

void paint(core_object::Object<MappedScreen> &self) {
	self->writer->write(2);
}

void paint(core_object::Object<CollisionScreen> &self) {
	paintPrivateClosure(self);
}

void paintPrivateClosure(core_object::Object<CollisionScreen> &self) {
	self->writer->write(3);
}

void paint() {

}

void paint(core_object::Object<PrivateScreen> &self) {
	notify(self);
}

void notify(core_object::Object<PrivateScreen> &self) {
	self->writer->write(4);
}

core_object::Object<Screen> getScreen(core_object::Object<Writer> writer) {
	return core_object::Object<Screen>(Screen{ writer });
}

core_object::Object<MappedScreen> getMappedScreen(core_object::Object<Writer> writer) {
	return core_object::Object<MappedScreen>(MappedScreen{ writer });
}

core_object::Object<CollisionScreen> getCollisionScreen(core_object::Object<Writer> writer) {
	return core_object::Object<CollisionScreen>(CollisionScreen{ writer });
}

core_object::Object<StatelessScreen> getStatelessScreen() {
	return core_object::Object<StatelessScreen>(StatelessScreen{ paint });
}

core_object::Object<PrivateScreen> getPrivateScreen(core_object::Object<Writer> writer) {
	return core_object::Object<PrivateScreen>(PrivateScreen{ writer });
}

void setup() {
	core_object::Object<Writer> writer = core_object::Object<Writer>(Writer{ [](i16 value) -> void {

	} });
	([&]() { auto _e95_receiver_74_5 = getScreen(writer); return paint(_e95_receiver_74_5); })();
	([&]() { auto _e95_receiver_75_5 = getMappedScreen(writer); return paint(_e95_receiver_75_5); })();
	([&]() { auto _e95_receiver_76_5 = getCollisionScreen(writer); return paint(_e95_receiver_76_5); })();
	getStatelessScreen()->paint();
	([&]() { auto _e95_receiver_78_5 = getPrivateScreen(writer); return paint(_e95_receiver_78_5); })();
}

void loop() {
}
