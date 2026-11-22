// CORE
#include <core_gpio.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>
// MODULES
#include <mod_async_task.h>

struct _ReadSensorAsyncTask {
	u8 value;
};

struct _BlinkAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadSensor;
	u8 value;
};

struct getPersonaReturn {
	core_string::String name;
	i8 age;
};

struct _ReadPersonaAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadSensor;
	core_object::Object<getPersonaReturn> persona;
};

inline void _e95Trace__BlinkAsyncTask(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<_BlinkAsyncTask> *typed = (core_mem::RefBox<_BlinkAsyncTask> *)box;
	_BlinkAsyncTask *value = &typed->value;
	if (!value->childReadSensor.isNull) {
		value->childReadSensor.value.traceChild(visit);
	}
}

namespace core_mem {
template <>
struct TypeInfoOf<_BlinkAsyncTask> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<_BlinkAsyncTask>,
			&_e95Trace__BlinkAsyncTask,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

inline void _e95Trace__ReadPersonaAsyncTask(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<_ReadPersonaAsyncTask> *typed = (core_mem::RefBox<_ReadPersonaAsyncTask> *)box;
	_ReadPersonaAsyncTask *value = &typed->value;
	if (!value->childReadSensor.isNull) {
		value->childReadSensor.value.traceChild(visit);
	}
	value->persona.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<_ReadPersonaAsyncTask> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<_ReadPersonaAsyncTask>,
			&_e95Trace__ReadPersonaAsyncTask,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

core_object::Object<mod_async_task::_AsyncTaskItem> _readSensorAsyncAdd(boolean isChild) {
	core_object::Object<_ReadSensorAsyncTask> task = core_object::Object<_ReadSensorAsyncTask>(_ReadSensorAsyncTask{ 0 });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::READ_SENSOR, isChild);
}

core_object::Object<mod_async_task::_AsyncTaskItem> _blinkAsyncAdd(boolean isChild) {
	core_object::Object<_BlinkAsyncTask> task = core_object::Object<_BlinkAsyncTask>(_BlinkAsyncTask{ nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() }, 0 });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::BLINK, isChild);
}

core_object::Object<mod_async_task::_AsyncTaskItem> _readPersonaAsyncAdd(boolean isChild) {
	core_object::Object<_ReadPersonaAsyncTask> task = core_object::Object<_ReadPersonaAsyncTask>(_ReadPersonaAsyncTask{ nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() }, core_object::Object<getPersonaReturn>(getPersonaReturn{ "", 0 }) });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::READ_PERSONA, isChild);
}

void _readSensorAsyncHandler(core_object::Object<mod_async_task::_AsyncTaskItem> item) {
	_ReadSensorAsyncTask* task = (_ReadSensorAsyncTask*)(item->task.value.pointer());

	switch (item->step) {
		case 0:
			if (item->status == mod_async_task::_AsyncTaskStatus::RUNNING_CHILD) {
				item->status = mod_async_task::_AsyncTaskStatus::COMPLETED;
			} else {
				item->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			}
			task->value = 42;
			break;
		default:
			break;
	}
}

void _blinkAsyncHandler(core_object::Object<mod_async_task::_AsyncTaskItem> item) {
	_BlinkAsyncTask* task = (_BlinkAsyncTask*)(item->task.value.pointer());

	switch (item->step) {
		case 0:
			task->childReadSensor = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ false, _readSensorAsyncAdd(true) };
			item->step = 1;
			break;
		case 1:
			if (task->childReadSensor.value->status != mod_async_task::_AsyncTaskStatus::COMPLETED) {
				return;
			}
			item->step = 2;
			break;
		case 2:
			task->value = ((_ReadSensorAsyncTask*)(task->childReadSensor.value->task.value.pointer()))->value;
			task->childReadSensor.value->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			core_gpio::setAnalog(core_gpio::Pin::PIN_3, task->value);
			core_gpio::setDigital(core_gpio::Pin::PIN_10, core_gpio::HIGH);
			core_time::delay(50);
			core_gpio::setDigital(core_gpio::Pin::PIN_10, core_gpio::LOW);
			if (item->status == mod_async_task::_AsyncTaskStatus::RUNNING_CHILD) {
				item->status = mod_async_task::_AsyncTaskStatus::COMPLETED;
			} else {
				item->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			}
			break;
		default:
			break;
	}
}

core_object::Object<getPersonaReturn> getPersona() {
	return core_object::Object<getPersonaReturn>(getPersonaReturn{ F("David"), 31 });
}

void _readPersonaAsyncHandler(core_object::Object<mod_async_task::_AsyncTaskItem> item) {
	_ReadPersonaAsyncTask* task = (_ReadPersonaAsyncTask*)(item->task.value.pointer());

	switch (item->step) {
		case 0:
			task->persona = getPersona();
			task->childReadSensor = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ false, _readSensorAsyncAdd(true) };
			item->step = 1;
			break;
		case 1:
			if (task->childReadSensor.value->status != mod_async_task::_AsyncTaskStatus::COMPLETED) {
				return;
			}
			task->childReadSensor.value->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			item->step = 2;
			break;
		case 2:
			core_time::delay(task->persona->age);
			if (item->status == mod_async_task::_AsyncTaskStatus::RUNNING_CHILD) {
				item->status = mod_async_task::_AsyncTaskStatus::COMPLETED;
			} else {
				item->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			}
			break;
		default:
			break;
	}
}

void setup() {
	// SETUP
	core_gpio::setMode(core_gpio::Pin::PIN_10, core_gpio::OUTPUT);

	// MAIN
	_blinkAsyncAdd(false);
	_readPersonaAsyncAdd(false);
	core_object::Object<mod_async_task::_AsyncHandlers> handlers = core_object::Object<mod_async_task::_AsyncHandlers>(mod_async_task::_AsyncHandlers{ _readSensorAsyncHandler, _blinkAsyncHandler, _readPersonaAsyncHandler });
	mod_async_task::_asyncEventLoop(handlers);
}

void loop() {
}
