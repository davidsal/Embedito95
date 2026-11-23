// CORE
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
// MODULES
#include "modules/async_task/mod_async_task.h"

struct _getPersonaReturn {
	core_string::String name;
	i8 age;
};

struct _ReadSensorAsyncTask {
	u8 value;
};

struct _BlinkAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadSensor;
	u8 value;
};

struct _ReadPersonaAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadSensor;
	core_object::Object<_getPersonaReturn> persona;
};

struct _ReadAsyncPersonaAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadSensor;
	core_object::Object<_getPersonaReturn> value;
};

struct _ConsumePersonaAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadAsyncPersona;
	core_object::Object<_getPersonaReturn> persona;
	core_string::String first;
	core_string::String second;
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

inline void _e95Trace__ReadAsyncPersonaAsyncTask(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<_ReadAsyncPersonaAsyncTask> *typed = (core_mem::RefBox<_ReadAsyncPersonaAsyncTask> *)box;
	_ReadAsyncPersonaAsyncTask *value = &typed->value;
	if (!value->childReadSensor.isNull) {
		value->childReadSensor.value.traceChild(visit);
	}
	value->value.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<_ReadAsyncPersonaAsyncTask> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<_ReadAsyncPersonaAsyncTask>,
			&_e95Trace__ReadAsyncPersonaAsyncTask,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

inline void _e95Trace__ConsumePersonaAsyncTask(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<_ConsumePersonaAsyncTask> *typed = (core_mem::RefBox<_ConsumePersonaAsyncTask> *)box;
	_ConsumePersonaAsyncTask *value = &typed->value;
	if (!value->childReadAsyncPersona.isNull) {
		value->childReadAsyncPersona.value.traceChild(visit);
	}
	value->persona.traceChild(visit);
}

namespace core_mem {
template <>
struct TypeInfoOf<_ConsumePersonaAsyncTask> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<_ConsumePersonaAsyncTask>,
			&_e95Trace__ConsumePersonaAsyncTask,
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
	core_object::Object<_ReadPersonaAsyncTask> task = core_object::Object<_ReadPersonaAsyncTask>(_ReadPersonaAsyncTask{ nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() }, core_object::Object<_getPersonaReturn>::null() });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::READ_PERSONA, isChild);
}

core_object::Object<mod_async_task::_AsyncTaskItem> _readAsyncPersonaAsyncAdd(boolean isChild) {
	core_object::Object<_ReadAsyncPersonaAsyncTask> task = core_object::Object<_ReadAsyncPersonaAsyncTask>(_ReadAsyncPersonaAsyncTask{ nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() }, core_object::Object<_getPersonaReturn>::null() });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::READ_ASYNC_PERSONA, isChild);
}

core_object::Object<mod_async_task::_AsyncTaskItem> _consumePersonaAsyncAdd(boolean isChild) {
	core_object::Object<_ConsumePersonaAsyncTask> task = core_object::Object<_ConsumePersonaAsyncTask>(_ConsumePersonaAsyncTask{ nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() }, core_object::Object<_getPersonaReturn>::null(), "", "" });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::CONSUME_PERSONA, isChild);
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
			task->childReadSensor = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() };
			core_gpio::setAnalog(core_gpio::Pin::PIN_B9, task->value);
			core_gpio::setDigital(core_gpio::Pin::PIN_LED_BUILTIN, core_gpio::HIGH);
			core_time::delay(50);
			core_gpio::setDigital(core_gpio::Pin::PIN_LED_BUILTIN, core_gpio::LOW);
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

core_object::Object<_getPersonaReturn> getPersona() {
	return core_object::Object<_getPersonaReturn>(_getPersonaReturn{ "David", 31 });
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
			task->childReadSensor = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() };
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

void _readAsyncPersonaAsyncHandler(core_object::Object<mod_async_task::_AsyncTaskItem> item) {
	_ReadAsyncPersonaAsyncTask* task = (_ReadAsyncPersonaAsyncTask*)(item->task.value.pointer());

	switch (item->step) {
		case 0:
			task->childReadSensor = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ false, _readSensorAsyncAdd(true) };
			item->step = 1;
			break;
		case 1:
			if (task->childReadSensor.value->status != mod_async_task::_AsyncTaskStatus::COMPLETED) {
				return;
			}
			task->childReadSensor.value->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			task->childReadSensor = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() };
			item->step = 2;
			break;
		case 2:
			if (item->status == mod_async_task::_AsyncTaskStatus::RUNNING_CHILD) {
				item->status = mod_async_task::_AsyncTaskStatus::COMPLETED;
			} else {
				item->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			}
			task->value = core_object::Object<_getPersonaReturn>(_getPersonaReturn{ "David", 31 });
			break;
		default:
			break;
	}
}

void _consumePersonaAsyncHandler(core_object::Object<mod_async_task::_AsyncTaskItem> item) {
	_ConsumePersonaAsyncTask* task = (_ConsumePersonaAsyncTask*)(item->task.value.pointer());

	switch (item->step) {
		case 0:
			task->childReadAsyncPersona = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ false, _readAsyncPersonaAsyncAdd(true) };
			item->step = 1;
			break;
		case 1:
			if (task->childReadAsyncPersona.value->status != mod_async_task::_AsyncTaskStatus::COMPLETED) {
				return;
			}
			item->step = 2;
			break;
		case 2:
			task->persona = ((_ReadAsyncPersonaAsyncTask*)(task->childReadAsyncPersona.value->task.value.pointer()))->value;
			task->childReadAsyncPersona.value->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			task->childReadAsyncPersona = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() };
			task->first = task->persona->name;
			task->second = task->persona->name;
			core_time::delay(task->persona->age);
			if (task->first == task->second) {
				core_gpio::setAnalog(core_gpio::Pin::PIN_B9, 1);
			}
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

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(core_gpio::Pin::PIN_LED_BUILTIN, core_gpio::OUTPUT);

	// MAIN
	_blinkAsyncAdd(false);
	_readPersonaAsyncAdd(false);
	_consumePersonaAsyncAdd(false);
	core_object::Object<mod_async_task::_AsyncHandlers> handlers = core_object::Object<mod_async_task::_AsyncHandlers>(mod_async_task::_AsyncHandlers{ _readSensorAsyncHandler, _blinkAsyncHandler, _readPersonaAsyncHandler, _readAsyncPersonaAsyncHandler, _consumePersonaAsyncHandler });
	mod_async_task::_asyncEventLoop(handlers);
}
