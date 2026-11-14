// Single source of truth for the refcount cycle collector switch.
//
// The codegen emits `#define E95_CYCLES 0` in the generated headers, but that
// only covers the project translation unit: copied core, library, module and
// async units are compiled separately and would otherwise see the `1` default
// from `ref.h`. Two different bodies for the inline functions in `ref.h` across
// translation units is an ODR violation and makes `enableCycleCollector: false`
// behave like `true`, so every compile strategy also passes the value as a
// preprocessor argument.
export const ENABLE_CYCLE_COLLECTOR_OPTION = "enableCycleCollector";

const DEFAULT_ENABLE_CYCLE_COLLECTOR = true;
const CYCLES_DEFINE_NAME = "E95_CYCLES";

export const resolveCyclesEnabled = (configuration) => {
	return (
		configuration[ENABLE_CYCLE_COLLECTOR_OPTION] ??
		DEFAULT_ENABLE_CYCLE_COLLECTOR
	);
};

export const renderCyclesDefineArgument = (cycles) => {
	return `-D${CYCLES_DEFINE_NAME}=${cycles ? 1 : 0}`;
};
