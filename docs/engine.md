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

This gives deterministic lifetimes: no GC, no scanning pause and no manual
`free`/`delete`. Objects store their fields inline, so releasing the root
releases nested handles in cascade.

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

Cycles are the known limit: a direct self-reference such as `node.next = node`
is rejected at compile time, but longer cycles are not detected and leak. The
runtime is single-threaded, so counters are plain `uint16_t` values without
atomics.

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
