// CORE
#include "core/gpio/core_gpio.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
// MODULES
#include "modules/async_task/mod_async_task.h"

struct _ReadSensorAsyncTask {
	u8 value;
};

struct _BlinkAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadSensor;
	u8 value;
};

core_object::Object<mod_async_task::_AsyncTaskItem> _readSensorAsyncAdd(boolean isChild) {
	core_object::Object<_ReadSensorAsyncTask> task = core_object::Object<_ReadSensorAsyncTask>(_ReadSensorAsyncTask{ 0 });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::READ_SENSOR, isChild);
}

core_object::Object<mod_async_task::_AsyncTaskItem> _blinkAsyncAdd(boolean isChild) {
	core_object::Object<_BlinkAsyncTask> task = core_object::Object<_BlinkAsyncTask>(_BlinkAsyncTask{ nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() }, 0 });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::BLINK, isChild);
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

int main() {
	// SETUP
	initializeSystemClock();
	core_gpio::setMode(core_gpio::Pin::PIN_LED_BUILTIN, core_gpio::OUTPUT);

	// MAIN
	_blinkAsyncAdd(false);
	core_object::Object<mod_async_task::_AsyncHandlers> handlers = core_object::Object<mod_async_task::_AsyncHandlers>(mod_async_task::_AsyncHandlers{ _readSensorAsyncHandler, _blinkAsyncHandler });
	mod_async_task::_asyncEventLoop(handlers);
}
