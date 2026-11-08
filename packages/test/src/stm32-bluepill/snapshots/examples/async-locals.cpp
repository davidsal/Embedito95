// CORE
#include "core/async/core_async.h"
#include "core/spi/core_spi.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"
// MODULES
#include "modules/async_task/mod_async_task.h"

struct _ReadStepAsyncTask {
	i16 value;
	u32 childSleepMilliseconds;
	u32 childSleepStart;
};

struct _AnimateAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadStep;
	i32 value;
	i32 step;
	u8 annotated;
	i32 sum;
	u8 transferred;
	i16 awaited;
	u32 childSleepMilliseconds;
	u32 childSleepStart;
};

const i8 STEP_SIZE = 1;
const i8 STEP_LIMIT = 10;

core_object::Object<mod_async_task::_AsyncTaskItem> _readStepAsyncAdd(boolean isChild) {
	core_object::Object<_ReadStepAsyncTask> task = core_object::Object<_ReadStepAsyncTask>(_ReadStepAsyncTask{ 0, 0, 0 });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::READ_STEP, isChild);
}

core_object::Object<mod_async_task::_AsyncTaskItem> _animateAsyncAdd(boolean isChild) {
	core_object::Object<_AnimateAsyncTask> task = core_object::Object<_AnimateAsyncTask>(_AnimateAsyncTask{ nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ true, core_object::Object<mod_async_task::_AsyncTaskItem>::null() }, 0, 0, 0, 0, 0, 0, 0, 0 });
	return mod_async_task::_addAsyncTask(task, mod_async_task::_AsyncTask::ANIMATE, isChild);
}

void _readStepAsyncHandler(core_object::Object<mod_async_task::_AsyncTaskItem> item) {
	_ReadStepAsyncTask* task = (_ReadStepAsyncTask*)(item->task.value.pointer());

	switch (item->step) {
		case 0:
			task->childSleepMilliseconds = 1;
			task->childSleepStart = core_time::getMillis();
			item->step = 1;
			break;
		case 1:
			if (!(core_time::hasElapsed(task->childSleepStart, task->childSleepMilliseconds))) {
				return;
			}
			item->step = 2;
			break;
		case 2:
			if (item->status == mod_async_task::_AsyncTaskStatus::RUNNING_CHILD) {
				item->status = mod_async_task::_AsyncTaskStatus::COMPLETED;
			} else {
				item->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			}
			task->value = STEP_SIZE;
			break;
		default:
			break;
	}
}

void _animateAsyncHandler(core_object::Object<mod_async_task::_AsyncTaskItem> item) {
	_AnimateAsyncTask* task = (_AnimateAsyncTask*)(item->task.value.pointer());

	switch (item->step) {
		case 0:
			task->value = 0;
			task->step = STEP_SIZE;
			task->annotated = 0;
			item->step = 1;
			break;
		case 1:
			if (task->value < (i32)(STEP_LIMIT)) {
				item->step = 2;
			} else {
				item->step = 3;
			}
			break;
		case 2:
			task->sum = task->value + task->step;
			task->transferred = core_spi::getSPI(core_spi::SPI::SPI_1).transfer(0);
			task->childReadStep = nullable<core_object::Object<mod_async_task::_AsyncTaskItem>>{ false, _readStepAsyncAdd(true) };
			item->step = 4;
			break;
		case 3:
			if (item->status == mod_async_task::_AsyncTaskStatus::RUNNING_CHILD) {
				item->status = mod_async_task::_AsyncTaskStatus::COMPLETED;
			} else {
				item->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			}
			break;
		case 4:
			if (task->childReadStep.value->status != mod_async_task::_AsyncTaskStatus::COMPLETED) {
				return;
			}
			item->step = 5;
			break;
		case 5:
			task->awaited = ((_ReadStepAsyncTask*)(task->childReadStep.value->task.value.pointer()))->value;
			task->childReadStep.value->status = mod_async_task::_AsyncTaskStatus::CONSUMED;
			task->value = (((task->value + task->step) + task->sum) + (i32)(task->transferred)) + (i32)(task->awaited);
			task->annotated = (i32)(task->annotated) + (i32)(1);
			task->childSleepMilliseconds = 2;
			task->childSleepStart = core_time::getMillis();
			item->step = 6;
			break;
		case 6:
			if (!(core_time::hasElapsed(task->childSleepStart, task->childSleepMilliseconds))) {
				return;
			}
			item->step = 1;
			break;
		default:
			break;
	}
}

int main() {
	// SETUP
	initializeSystemClock();

	// MAIN
	_animateAsyncAdd(false);
	core_object::Object<mod_async_task::_AsyncHandlers> handlers = core_object::Object<mod_async_task::_AsyncHandlers>(mod_async_task::_AsyncHandlers{ _readStepAsyncHandler, _animateAsyncHandler });
	mod_async_task::_asyncEventLoop(handlers);
}
