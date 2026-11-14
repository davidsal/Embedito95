# Engine

This document covers the runtime mechanisms behind e95 values: handles and
reference counting, heap fragmentation and cooperative multitasking. See
[e95](e95-language.md) for the language design, [types](language/types.md) for
supported types and value behavior, and
[expressions](language/expressions.md) for binary operations.

## 1. Handles and reference counting

Strings, arrays and objects are handles to a refcounted heap block:

```cpp
template <typename T>
struct RefBox {
    uint16_t refs;
    T value;
};
```

The **handle** is the small value that lives in a variable, parameter or return
slot: `Ref<T>`, `String`, `Array<T>` or `Object<Fields>`. The `RefBox` lives on
the heap and is shared by every handle that points to it. Copying a handle does
not copy the payload; it only increments the count.

### Lifetime rules

- **Copy** increments the count.
- **Move** transfers the block without touching the count.
- **Assignment** releases the old block and acquires the new one.
- **Destruction** decrements; at zero the payload is destroyed and freed.

This gives deterministic lifetimes: no manual `free`/`delete`, no whole-heap
tracing GC and no concurrent scanning pause. Objects store their fields inline,
so releasing the root releases nested handles in cascade.

### Copy-on-write detach

A `String` is a handle to `StrStorage`. Copying the handle shares the block and
increments `refs`; no text is copied.

Before every mutating operation (`push`, `pop`, `append`, `setCharacter`,
`removeRange`, `trimWhitespace`, case folding, non-const `[]`), the runtime calls
`ensureUnique()`:

- If `refs == 1`, the string is already private and the write happens in place.
- If `refs > 1`, it allocates a new `RefBox<StrStorage>`, deep-copies the text,
  rebinds this handle to the copy and releases the old block. Other handles keep
  pointing to the old text.

After detaching, the handle is private again, so later writes are in place until
the string is shared once more.

### Cycle collection

Plain reference counting cannot reclaim a reference cycle: `node.next = node`, a
doubly linked list or a parent pointer keeps the count above zero forever. The
runtime therefore ships a **trial-deletion collector**, included by default, that
reclaims unreachable cycles at runtime. No `weak` reference, no annotation and no
syntax on the user side is needed.

How it works:

- **Synchronous trial deletion (Bacon–Rajan).** Collection runs inline on the
  allocating thread, like CPython's cycle collector: mark the candidate graph
  GRAY while subtracting the internal edges, restore the refcounts of nodes
  reachable from an outside handle, and destroy the remaining WHITE nodes.
- **Single-threaded, no write barrier, no atomics.** The event loop and the
  collector never run in parallel, so counts stay plain `uint16_t` values and
  every mutation is visible immediately.
- **No root scanning.** Handles on the stack are ordinary reference counts, so a
  reachable object always has `refs > 0`. Only boxes whose count *dropped but did
  not reach zero* are candidates; an object held by any live handle is never
  collected, even if it sits inside a cycle.
- **No static detection.** The compiler does not reject or rewrite cycles; a
  cycle is legal code and the decision to free it happens at runtime.

Triggers — the collector never runs from inside a release:

- an `malloc` failure: the collector runs once and the allocation is retried
  (the retry still returns null, never throws, if memory is genuinely exhausted);
- the candidate list filling up: it is drained from the next allocation, which
  bounds the number of unregistered candidates between allocations.

The worklist is a fixed array, `E95_CYCLES_WORKLIST` entries (32 by default,
configurable at compile time). Each entry is `{box, TypeInfo*}` — 16 bytes on a
64-bit host, 8 on Thumb — so the default costs 512 bytes of static RAM plus a few
counters on a 64-bit host. Because a node is colored when it is enqueued, each
node uses at most one slot. If a graph does not fit, the marking pass is rolled
back and the collection is **skipped**: the program keeps running and the cycles
are retried on a later trigger, with no corruption of refcounts, colors or
payloads. A cycle whose candidate graph is always larger than the worklist can
therefore stay allocated for the lifetime of the program; the limit is a
compile-time knob, not a correctness constraint.

Enabling and disabling:

- `E95_CYCLES` (default `1`) compiles the collector in. `enableCycleCollector:
  false` in `config.json` emits `E95_CYCLES 0`: no candidate list, no `trace`
  calls and no collector code, at the cost of leaking real cycles.
- Colors share the `uint16_t` refcount word (2 high bits), so a box does not grow
  by a single byte. The count saturates at 16383 instead of spilling into the
  color bits.

Measured cost: roughly 1.3 KB of code plus 528 bytes of static RAM on a 64-bit
host with the default worklist, and roughly 1.4 KB of flash plus 138 bytes of
static RAM on AVR (ATmega328P / ATtiny85). The AVR static RAM is much lower than
the host figure because a record is `{box, TypeInfo*}` with 2-byte pointers, so
the 32-slot worklist is 128 bytes. ARM has not been measured yet; it should sit
between the two (8-byte records, so 256 bytes for the default worklist). See the
platform commands below before using these as a firmware budget.

#### Host measurement

A minimal translation unit that includes `memory/ref.h`, builds a two-node
`first -> second -> first` cycle with a handle field and calls `collectCycles()`
once, compiled twice with Apple `clang++` 21.0.0 on `arm64-apple-darwin`:

```sh
cd packages/test/runtime-tests/measure
clang++ -std=c++11 -Os -fno-exceptions -fno-rtti -I ../../../.. \
  -DE95_CYCLES=0 -o off measure.cpp
clang++ -std=c++11 -Os -fno-exceptions -fno-rtti -I ../../../.. \
  -DE95_CYCLES=1 -o on  measure.cpp
size -m off on
```

| Build | `__text` | Static data (`__data`) |
| --- | --- | --- |
| `E95_CYCLES=0` | 620 B | 0 B |
| `E95_CYCLES=1` | 1936 B | 528 B |
| Difference | +1316 B | +528 B |

The data block is the collector singleton (`CycleCollector`: 32 records × 16 B
plus counters); the text block is `collectCycles`, `enqueueCycleChild`,
`restoreCycleChild` and the inlined candidate bookkeeping in
`allocateRefBox`/`release`. The 528 B matches the layout exactly, which is why
the static-RAM figure is trustworthy even though the code size is host-specific.

#### AVR measurement

The same `measure.cpp` compiled with the Arduino AVR toolchain
(`avr-gcc 7.3.0-atmel3.6.1-arduino7`) for both a 32 KB AVR (ATmega328P) and a
tiny one (ATtiny85). `-I` points at the Arduino core only for its C++ `<new>`
implementation; the repository root supplies `memory/ref.h`. From the repository
root:

```sh
AVR=~/Library/Arduino15/packages/arduino/tools/avr-gcc/7.3.0-atmel3.6.1-arduino7/bin
CORE=~/Library/Arduino15/packages/arduino/hardware/avr/1.8.8/cores/arduino
for MCU in atmega328p attiny85; do
  for CYCLES in 0 1; do
    "$AVR/avr-g++" -c -Os -std=gnu++11 -fno-exceptions -fno-rtti \
      -mmcu=$MCU -DE95_CYCLES=$CYCLES -I . -I "$CORE" \
      -o "/tmp/$MCU-$CYCLES.o" \
      packages/test/runtime-tests/measure/measure.cpp
  done
  "$AVR/avr-size" "/tmp/$MCU-0.o" "/tmp/$MCU-1.o"
done
```

| MCU | Build | `text` | `data` | `bss` |
| --- | --- | --- | --- | --- |
| ATmega328P | `E95_CYCLES=0` | 658 B | 0 B | 2 B |
| ATmega328P | `E95_CYCLES=1` | 2100 B | 0 B | 140 B |
| ATmega328P | Difference | +1442 B | 0 B | +138 B |
| ATtiny85 | `E95_CYCLES=0` | 624 B | 0 B | 2 B |
| ATtiny85 | `E95_CYCLES=1` | 2052 B | 0 B | 140 B |
| ATtiny85 | Difference | +1428 B | 0 B | +138 B |

The 138 B of static RAM is the 32-slot worklist (4 B per record on AVR) plus
the counters and flags; two more bytes of `bss` come from the fixture itself in
both builds. The code delta is the collector passes plus the candidate
bookkeeping inlined into every `release`/allocation call site.

## 2. Heap fragmentation

The goal is not to eliminate fragmentation, which requires compaction or a GC,
but to **reduce allocation churn**. Values keep reusing their buffer instead of
allocating a new one on every mutation.

| | `string` | Arrays |
| --- | --- | --- |
| Minimum capacity | 5 chars | 5 elements |
| Growth | `cap + cap / divisor + 1` | same |
| Growth factor | 1.25 AVR, 1.5 STM32 | 1.25 AVR, 1.5 STM32 |
| Append/push | writes into spare capacity | constructs into spare capacity |
| Remove | `memmove` inside the buffer | `pop` destroys the last element |
| Shrink | on `pop`, at ≤ 50 % half the capacity | same |
| Sharing | copy-on-write | shared-mutable |

The practical effect:

- Buffer allocation happens only when capacity is exhausted or halved; routine
  appends, pushes, pops and removals reuse the existing block.
- Geometric growth makes pushes amortized O(1).
- Copying a string shares its text; the first write detaches. Copying an array
  aliases it.
- `reserve` and `reserveCapacity` preallocate when the final size is known.
- A fixed-size `T[N]` annotation does **not** create a stack buffer or reserve
  `N` elements: it still lowers to `core_array::Array<T>` and grows dynamically.

Trade-offs: buffers may keep up to about 50 % spare capacity, and without
compaction a mix of long-lived allocations can still fragment the heap. Reusing
values and reserving capacity up front remains the best defense.

## 3. Multitasking

Embedito95 uses **protothreads**: cooperative tasks on one core, not threads
and not preemptive scheduling.

### Async functions become state machines

- An `async` function is compiled into a step machine. Each `await` splits it
  into a state and a continuation.
- Locals and await bookkeeping (timer start, child task slot) live in a task
  struct, so a task does not need its own stack.
- Calling an async function schedules a task and returns a handle. Calling
  several from `main` runs them cooperatively.

### Event loop

- The loop keeps a queue of task slots and runs forever after the program
  starts.
- Each pass advances a rotating subset of running tasks by one step. Tasks
  created during the pass get a first step in the same pass (catch-up), so a new
  timer starts immediately.
- Consumed slots are compacted periodically, and the queue is a normal dynamic
  array: geometric growth and shrink at 50 % (section 2).
- Tasks run until they await or return. There is no preemption.

### `await sleep` and child tasks

- `await sleep(ms)` is inlined into the caller's task: it stores the duration
  and start time, then returns early until `hasElapsed` is true. No child task
  and no extra queue slot are created.
- `sleep()` or `sleep(0)` is a plain yield: it resumes on the next pass with no
  timer.
- `await otherAsync()` creates a child task and suspends the parent until the
  child reaches `COMPLETED`. The child slot is marked `CONSUMED` and reused; an
  expression await consumes it after reading the value.
- `delay(ms)` blocks the CPU and does **not** yield. Inside async tasks, use
  `await sleep(ms)` instead.

The scheduler is single-threaded: tasks interleave but never run in parallel.
That makes shared values safe from scheduler races, but a long synchronous loop
inside one task starves all the others.
