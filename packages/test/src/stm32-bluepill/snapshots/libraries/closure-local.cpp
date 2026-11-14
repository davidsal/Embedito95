// CORE
#include "core/system/core_system.h"
#include "core/type/core_type.h"

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

inline void _e95Trace_Screen(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<Screen> *typed = (core_mem::RefBox<Screen> *)box;
	Screen *value = &typed->value;
	value->writer.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<Screen> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<Screen>,
			&_e95Trace_Screen,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

inline void _e95Trace_MappedScreen(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<MappedScreen> *typed = (core_mem::RefBox<MappedScreen> *)box;
	MappedScreen *value = &typed->value;
	value->writer.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<MappedScreen> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<MappedScreen>,
			&_e95Trace_MappedScreen,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

inline void _e95Trace_CollisionScreen(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<CollisionScreen> *typed = (core_mem::RefBox<CollisionScreen> *)box;
	CollisionScreen *value = &typed->value;
	value->writer.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<CollisionScreen> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<CollisionScreen>,
			&_e95Trace_CollisionScreen,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

inline void _e95Trace_PrivateScreen(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<PrivateScreen> *typed = (core_mem::RefBox<PrivateScreen> *)box;
	PrivateScreen *value = &typed->value;
	value->writer.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<PrivateScreen> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<PrivateScreen>,
			&_e95Trace_PrivateScreen,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

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

int main() {
	// SETUP
	initializeSystemClock();

	// MAIN
	core_object::Object<Writer> writer = core_object::Object<Writer>(Writer{ [](i16 value) -> void {

	} });
	([&]() { auto _e95_receiver_74_5 = getScreen(writer); return paint(_e95_receiver_74_5); })();
	([&]() { auto _e95_receiver_75_5 = getMappedScreen(writer); return paint(_e95_receiver_75_5); })();
	([&]() { auto _e95_receiver_76_5 = getCollisionScreen(writer); return paint(_e95_receiver_76_5); })();
	getStatelessScreen()->paint();
	([&]() { auto _e95_receiver_78_5 = getPrivateScreen(writer); return paint(_e95_receiver_78_5); })();
}
