// CORE
#include <core_async.h>
#include <core_spi.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>
// MODULES
#include <mod_async_task.h>

struct _ReadStepAsyncTask {
	i16 value;
	u32 childSleepMilliseconds;
	u32 childSleepStart;
};

struct _AnimateAsyncTask {
	nullable<core_object::Object<mod_async_task::_AsyncTaskItem>> childReadStep;
	i16 value;
	i16 step;
	u8 annotated;
	i16 sum;
	u8 transferred;
	i16 awaited;
	u32 childSleepMilliseconds;
	u32 childSleepStart;
};

inline void _e95Trace__AnimateAsyncTask(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<_AnimateAsyncTask> *typed = (core_mem::RefBox<_AnimateAsyncTask> *)box;
	_AnimateAsyncTask *value = &typed->value;
	if (!value->childReadStep.isNull) {
		value->childReadStep.value.traceChild(visit);
	}
}

namespace core_mem {
template <>
struct TypeInfoOf<_AnimateAsyncTask> {
	static const TypeInfo *get() noexcept {
		static const TypeInfo typeInfo = {
			&destroyRefBox<_AnimateAsyncTask>,
			&_e95Trace__AnimateAsyncTask,
		};
		return &typeInfo;
	}
};
} // namespace core_mem

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
			if (task->value < (i16)(STEP_LIMIT)) {
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
			task->value = (((task->value + task->step) + task->sum) + (i16)(task->transferred)) + task->awaited;
			task->annotated = (i16)(task->annotated) + (i16)(1);
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

void setup() {
	_animateAsyncAdd(false);
	core_object::Object<mod_async_task::_AsyncHandlers> handlers = core_object::Object<mod_async_task::_AsyncHandlers>(mod_async_task::_AsyncHandlers{ _readStepAsyncHandler, _animateAsyncHandler });
	mod_async_task::_asyncEventLoop(handlers);
}

void loop() {
}
