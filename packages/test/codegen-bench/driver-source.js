// C++ source of the host bench driver. It supplies the Arduino stand-ins the
// generated translation unit expects, defines the `e95_bench_*` hooks that the
// instrumented scheduler calls, counts allocations by interposing on
// `malloc`/`free`/`realloc` (same pattern as `codegen-leak`) and stops the
// (otherwise endless) event loop after `durationPasses` completed passes.
//
// Precision choices:
// - every duration is measured in nanoseconds with a high-resolution clock
//   (`clock_gettime_nsec_np(CLOCK_UPTIME_RAW)` on Darwin, where `CLOCK_MONOTONIC`
//   only resolves ~1 µs; `clock_gettime(CLOCK_MONOTONIC)` elsewhere). The driver
//   also reports the clock name and its resolution so a degenerate result
//   (median 0 ns) can be detected and marked non-conclusive on the JS side;
// - the first `warmUpPasses` passes are executed but not recorded, so the
//   reported samples describe steady state;
// - each measured pass is printed as a sample, so the JS side computes median
//   and p95 instead of a fixed small number of samples;
// - wake latency is emitted as a histogram (latency in simulated passes), not a
//   64-entry ring buffer.
// This file only exists in the bench temp project.
// Maximum number of pass samples the driver records. `--passes` is capped to
// this value (loudly, on the JS side) so the summary always represents every
// measured sample instead of silently truncating a larger run.
export const MAXIMUM_PASS_SAMPLES = 200000;
const MAXIMUM_LATENCY_PASSES = 4096;

export const buildBenchDriverSource = ({
	durationPasses,
	warmUpPasses = 0,
}) => {
	return `// Host bench driver (test-only): never shipped, never part of a snapshot.
#include <Arduino.h>
#include <dlfcn.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#define BENCH_MAXIMUM_PASS_SAMPLES ${MAXIMUM_PASS_SAMPLES}
#define BENCH_MAXIMUM_LATENCY_PASSES ${MAXIMUM_LATENCY_PASSES}

static long long bench_start_nanoseconds = 0;
static long long bench_pass_start_nanoseconds = 0;
static long long bench_pass_count = 0;
static long long bench_warmup_passes = ${warmUpPasses}LL;
static long long bench_pass_sample_count = 0;
static long long bench_pass_samples[BENCH_MAXIMUM_PASS_SAMPLES];
static long long bench_pass_visits = 0;
static long long bench_pass_dispatches = 0;
static long long bench_visit_count = 0;
static long long bench_visit_maximum = 0;
static long long bench_dispatch_count = 0;
static long long bench_dispatch_maximum = 0;
static long long bench_compaction_count = 0;
static long long bench_compaction_visit_count = 0;
static long long bench_wake_count = 0;
static long long bench_wake_total_passes = 0;
static long long bench_latency_histogram[BENCH_MAXIMUM_LATENCY_PASSES];

static unsigned long long bench_allocation_count = 0;
static unsigned long long bench_free_count = 0;
static unsigned long long bench_live_blocks = 0;
static unsigned long long bench_initial_live_blocks = 0;

static const long long bench_pass_limit = ${durationPasses}LL;

static long long bench_elapsed_nanoseconds(void) {
#ifdef __APPLE__
	// CLOCK_MONOTONIC resolves to ~1 µs on Darwin, which makes short passes
	// round to 0 ns. CLOCK_UPTIME_RAW has nanosecond resolution.
	return (long long)clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
#else
	struct timespec now;
	clock_gettime(CLOCK_MONOTONIC, &now);
	return (long long)now.tv_sec * 1000000000LL + (long long)now.tv_nsec;
#endif
}

static const char *bench_clock_name(void) {
#ifdef __APPLE__
	return "CLOCK_UPTIME_RAW";
#else
	return "CLOCK_MONOTONIC";
#endif
}

static long long bench_clock_resolution_nanoseconds(void) {
	struct timespec resolution;
#ifdef __APPLE__
	if (clock_getres(CLOCK_UPTIME_RAW, &resolution) == 0) {
		return (long long)resolution.tv_sec * 1000000000LL +
			(long long)resolution.tv_nsec;
	}
#else
	if (clock_getres(CLOCK_MONOTONIC, &resolution) == 0) {
		return (long long)resolution.tv_sec * 1000000000LL +
			(long long)resolution.tv_nsec;
	}
#endif
	return 1;
}

static void bench_record_wake(long long latencyPasses) {
	if (latencyPasses >= 0 && latencyPasses < BENCH_MAXIMUM_LATENCY_PASSES) {
		bench_latency_histogram[latencyPasses]++;
	}
	bench_wake_total_passes += latencyPasses;
	bench_wake_count++;
}

static void bench_finish(void) {
	const long long wall = bench_elapsed_nanoseconds() - bench_start_nanoseconds;
	const unsigned long long live = bench_live_blocks - bench_initial_live_blocks;

	printf("bench passes %lld\\n", bench_pass_count);
	printf("bench warmup_passes %lld\\n", bench_warmup_passes);
	printf("bench clock %s\\n", bench_clock_name());
	printf("bench clock_resolution_nanoseconds %lld\\n",
		bench_clock_resolution_nanoseconds());
	printf("bench wall_nanoseconds %lld\\n", wall);
	printf("bench visit_count %lld\\n", bench_visit_count);
	printf("bench visit_maximum %lld\\n", bench_visit_maximum);
	printf("bench dispatch_count %lld\\n", bench_dispatch_count);
	printf("bench dispatch_maximum %lld\\n", bench_dispatch_maximum);
	printf("bench compaction_count %lld\\n", bench_compaction_count);
	printf("bench compaction_visit_count %lld\\n", bench_compaction_visit_count);
	printf("bench allocation_count %llu\\n", bench_allocation_count);
	printf("bench free_count %llu\\n", bench_free_count);
	printf("bench live_blocks %llu\\n", live);
	printf("bench wake_count %lld\\n", bench_wake_count);
	for (long long index = 0; index < bench_pass_sample_count; index++) {
		printf("bench pass_sample_nanoseconds %lld\\n", bench_pass_samples[index]);
	}
	for (long long latency = 0; latency < BENCH_MAXIMUM_LATENCY_PASSES; latency++) {
		if (bench_latency_histogram[latency] > 0) {
			printf("bench latency_histogram %lld %lld\\n", latency,
				bench_latency_histogram[latency]);
		}
	}
	fflush(stdout);
	exit(0);
}

// Called once at the start of every pass. The duration of the pass that just
// ended is recorded here (and only then), which makes the stop exact: when the
// pass counter already equals the limit we record that last completed pass and
// stop, so durationPasses really means that many complete passes.
extern "C" void e95_bench_pass_start(void) {
	const long long now = bench_elapsed_nanoseconds();
	if (bench_pass_count > 0) {
		const long long duration = now - bench_pass_start_nanoseconds;
		if (bench_pass_count > bench_warmup_passes &&
			bench_pass_sample_count < BENCH_MAXIMUM_PASS_SAMPLES) {
			bench_pass_samples[bench_pass_sample_count] = duration;
			bench_pass_sample_count++;
		}
		if (bench_pass_visits > bench_visit_maximum) {
			bench_visit_maximum = bench_pass_visits;
		}
		if (bench_pass_dispatches > bench_dispatch_maximum) {
			bench_dispatch_maximum = bench_pass_dispatches;
		}
	}
	if (bench_pass_count >= bench_pass_limit) {
		bench_finish();
	}
	bench_pass_start_nanoseconds = now;
	bench_pass_visits = 0;
	bench_pass_dispatches = 0;
	bench_pass_count++;
}

// Pass counters are steady-state only: they are ignored during warm-up so the
// per-pass means line up with the recorded pass samples.
extern "C" void e95_bench_visit(void) {
	if (bench_pass_count > bench_warmup_passes) {
		bench_pass_visits++;
		bench_visit_count++;
	}
}

extern "C" void e95_bench_dispatch(void) {
	if (bench_pass_count > bench_warmup_passes) {
		bench_pass_dispatches++;
		bench_dispatch_count++;
	}
}

extern "C" void e95_bench_compaction(void) {
	if (bench_pass_count > bench_warmup_passes) {
		bench_compaction_count++;
	}
}

extern "C" void e95_bench_compact_visit(void) {
	if (bench_pass_count > bench_warmup_passes) {
		bench_compaction_visit_count++;
	}
}

// The host clock is deterministic: one pass is one simulated millisecond
// (e95_host_millis returns the pass counter). That makes the sleep wake-up a
// pure pass-count question, so the latency is directly comparable between
// scheduler variants and machines.
extern "C" int e95_bench_has_elapsed(unsigned long start_milliseconds, unsigned long elapsed_milliseconds) {
	const unsigned int elapsedNow = (unsigned int)bench_pass_count;
	const unsigned int start = (unsigned int)start_milliseconds;
	const unsigned int elapsed = (unsigned int)elapsed_milliseconds;
	const unsigned int elapsedPasses = (unsigned int)(elapsedNow - start);
	const int reached = elapsedPasses >= elapsed;
	if (reached && bench_pass_count > bench_warmup_passes) {
		bench_record_wake((long long)elapsedPasses - (long long)elapsed);
	}
	return reached;
}

extern "C" void *malloc(size_t size) {
	static void *(*realMalloc)(size_t) = (void *(*)(size_t))dlsym(RTLD_NEXT, "malloc");
	void *pointer = realMalloc(size);
	if (pointer) {
		bench_allocation_count++;
		bench_live_blocks++;
	}
	return pointer;
}

extern "C" void free(void *pointer) {
	static void (*realFree)(void *) = (void (*)(void *))dlsym(RTLD_NEXT, "free");
	if (pointer) {
		bench_free_count++;
		bench_live_blocks--;
	}
	realFree(pointer);
}

// A failed realloc leaves the original block intact; only a successful one
// replaces it. A successful realloc with a non-null pointer is counted as a
// free of the old block plus an alloc of the new one, so allocs - frees stays
// equal to the live-block count. realloc(p, 0) frees the block.
extern "C" void *realloc(void *pointer, size_t size) {
	static void *(*realRealloc)(void *, size_t) = (void *(*)(void *, size_t))dlsym(RTLD_NEXT, "realloc");
	void *result = realRealloc(pointer, size);
	if (result) {
		if (pointer) {
			bench_free_count++;
			bench_live_blocks--;
		}
		bench_allocation_count++;
		bench_live_blocks++;
	} else if (pointer && size == 0) {
		bench_free_count++;
		bench_live_blocks--;
	}
	return result;
}

extern "C" unsigned long e95_host_millis(void) {
	return (unsigned long)bench_pass_count;
}

extern "C" void e95_host_delay(unsigned long milliseconds) {
	(void)milliseconds;
}

extern "C" void e95_host_pin_mode(uint8_t pin, uint8_t mode) {
	(void)pin;
	(void)mode;
}

extern "C" void e95_host_digital_write(uint8_t pin, uint8_t value) {
	(void)pin;
	(void)value;
}

extern "C" int e95_host_digital_read(uint8_t pin) {
	(void)pin;
	return 0;
}

extern "C" void e95_host_analog_write(uint8_t pin, int value) {
	(void)pin;
	(void)value;
}

extern "C" int e95_host_analog_read(uint8_t pin) {
	(void)pin;
	return 0;
}

void setup();
void loop();

int main() {
	bench_initial_live_blocks = bench_live_blocks;
	bench_allocation_count = 0;
	bench_free_count = 0;
	bench_start_nanoseconds = bench_elapsed_nanoseconds();
	bench_pass_start_nanoseconds = bench_start_nanoseconds;
	setup();
	bench_finish();
	return 0;
}
`;
};
