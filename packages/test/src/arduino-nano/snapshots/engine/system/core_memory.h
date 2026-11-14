#ifndef _E95_MEMORY_H
#define _E95_MEMORY_H

// Shared reference-counted handle motor, platform-agnostic.
//
// Design intent (see todayPlan.md "gestión de memoria"): a single Ref<T>
// handle with correct RAII (copy-ctor acquire, move without acquire,
// operator= release-old + acquire-new, dtor release + free-if-0) that
// Array<T>, object fields and string-CoW will later be re-expressed on.
// This file is additive on purpose: it is not wired into any generated type
// yet, and is validated on the host by runtime-tests/ref.test.cpp.
//
// It is deliberately self-contained (only <stdint.h>/<stddef.h>/<stdlib.h>/
// <new>) so it can be compiled by the host toolchain and, later, inlined into
// platform headers without depending on platform typedefs (u8/u16/...).
//
// Cycle collection (E95_CYCLES, on by default):
//
// A plain refcount cannot reclaim reference cycles (`a.next = a`, doubly
// linked lists, parent pointers, graphs). The collector here is a synchronous,
// single-threaded trial deletion (Bacon-Rajan, like CPython's gc): no write
// barriers, no atomics, no separate concurrent version, no syntax/annotation
// on the user side. It never scans roots — stack handles are ordinary
// refcounts, so a live handle always keeps its object alive. Collection starts
// only from boxes whose refcount dropped but did not reach 0 (PURPLE
// candidates) and is triggered by an allocation failure or by the candidate
// list filling up.
//
// The generated object types wire into this collector through the
// `core_mem::TypeInfoOf<T>` specializations the codegen emits for every object
// that owns handle fields (see type-info.js); objects without handle fields
// keep the default leaf TypeInfo. `cycles: "off"` emits E95_CYCLES 0 and no
// collector wiring: no candidate list, no trace calls and no collector code,
// at the cost of leaking real cycles.
//
// Colors share the uint16_t `refs` word (2 high bits), so a box grows by 0
// bytes: BLACK (in use), PURPLE (candidate), GRAY (possible cycle member),
// WHITE (garbage). The refcount is limited to 16383; increments saturate there
// instead of spilling into the color bits.

#ifndef _E95_MEMORY_REF_H
#define _E95_MEMORY_REF_H

#include <new>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

#ifndef E95_CYCLES
#define E95_CYCLES 1
#endif

// Fixed collector worklist size, in entries. Each entry is {box, TypeInfo*}
// (8 bytes on Thumb), so the default costs ~264 bytes of static RAM including
// the bookkeeping counters.
#ifndef E95_CYCLES_WORKLIST
#define E95_CYCLES_WORKLIST 32
#endif

namespace core_mem {

// Heap block that owns a payload plus its reference count. The refcount lives
// in the same allocation as the value so a single free() releases everything.
// `refs` packs the count (low 14 bits) and the collector color (high 2 bits).
template <typename T>
struct RefBox {
	uint16_t refs;
	T value;
};

// Color/refcount layout shared by every box.
static const uint16_t REF_COUNT_MASK = 0x3FFFu;
static const uint16_t REF_COUNT_MAX = REF_COUNT_MASK;
static const uint16_t COLOR_BLACK = 0x0000u;
static const uint16_t COLOR_PURPLE = 0x4000u;
static const uint16_t COLOR_GRAY = 0x8000u;
static const uint16_t COLOR_WHITE = 0xC000u;
static const uint16_t COLOR_MASK = 0xC000u;

// Per-type vtable. A handle stores one pointer to it (replacing the old
// `destroy_` slot), so the handle does not grow. `destroy` runs the payload's
// destructor and frees the block; `trace` walks the payload's child handles and
// reports each one to the collector. Leaf types (numbers, strings' storage)
// leave `trace` null.
struct TypeInfo;

// Reports one child handle to the collector: its box and the TypeInfo that
// knows how to trace/destroy it. Called from a type's `trace`.
typedef void (*TraceVisitor)(const TypeInfo *childType, void *childBox);

struct TypeInfo {
	void (*destroy)(void *box);
	void (*trace)(void *box, TraceVisitor visit);
};

template <typename T>
void destroyRefBox(void *box) noexcept {
	RefBox<T> *typed = (RefBox<T> *)box;
	typed->value.~T();
	free(typed);
}

// Default TypeInfo of a type with no handle children. Codegen specializes
// TypeInfoOf<T> for types that own handles (objects with reference fields) to
// provide a non-null `trace`.
template <typename T>
struct RefBoxTypeInfo {
	static const TypeInfo value;
};

template <typename T>
const TypeInfo RefBoxTypeInfo<T>::value = { &destroyRefBox<T>, nullptr };

template <typename T>
struct TypeInfoOf {
	static const TypeInfo *get() noexcept {
		return &RefBoxTypeInfo<T>::value;
	}
};

inline uint16_t &refWord(void *box) noexcept {
	return *(uint16_t *)box;
}

inline uint16_t refCountOf(void *box) noexcept {
	return (uint16_t)(refWord(box) & REF_COUNT_MASK);
}

inline void setRefCount(void *box, uint16_t count) noexcept {
	refWord(box) = (uint16_t)((refWord(box) & COLOR_MASK) | (count & REF_COUNT_MASK));
}

inline uint16_t colorOf(void *box) noexcept {
	return (uint16_t)(refWord(box) & COLOR_MASK);
}

inline void setColor(void *box, uint16_t color) noexcept {
	refWord(box) = (uint16_t)((refWord(box) & REF_COUNT_MASK) | color);
}

#if E95_CYCLES

// One collector slot: the box and the TypeInfo needed to trace/destroy it.
struct CycleRecord {
	void *box;
	const TypeInfo *type;
};

// Collector state. The single `records` array is both the purple candidate
// registry (prefix `[0, candidateCount)`) and the breadth-first mark queue
// (`[0, recordCount)`, appended while marking). Because a node is colored GRAY
// at the moment it is queued, it is enqueued at most once, so a collection
// needs at most `E95_CYCLES_WORKLIST` distinct slots; when the graph is larger
// the collection is rolled back and skipped.
struct CycleCollector {
	CycleRecord records[E95_CYCLES_WORKLIST];
	uint16_t candidateCount;
	uint16_t recordCount;
	uint16_t processedCount;
	bool running;
	bool collectingWhites;
	bool traceOverflow;
	bool closureChanged;
};

inline CycleCollector &cycleCollector() noexcept {
	static CycleCollector collector = CycleCollector();
	return collector;
}

inline void collectCycles() noexcept;
inline void forgetCandidate(void *box) noexcept;

// True when `box` is one of the boxes the current collection registered (both
// whites and survivors). Leaves that no `trace` ever reported are absent, and
// are the boxes the white phase must still release normally.
inline bool isRecordedBox(const CycleCollector &collector, const void *box) noexcept {
	for (uint16_t i = 0; i < collector.recordCount; i++) {
		if (collector.records[i].box == box) {
			return true;
		}
	}
	return false;
}

// --- markGray: subtract every internal edge seen from a candidate graph -----

inline void enqueueCycleChild(const TypeInfo *type, void *childBox) noexcept {
	CycleCollector &collector = cycleCollector();
	if (colorOf(childBox) != COLOR_GRAY) {
		if (collector.recordCount >= E95_CYCLES_WORKLIST) {
			// Abort before touching this child: it is not decremented and is
			// not enqueued, so the rollback (which restores only GRAY children)
			// leaves it untouched.
			collector.traceOverflow = true;
			return;
		}
		setColor(childBox, COLOR_GRAY);
		collector.records[collector.recordCount].box = childBox;
		collector.records[collector.recordCount].type = type;
		collector.recordCount = (uint16_t)(collector.recordCount + 1);
	}
	setRefCount(childBox, (uint16_t)(refCountOf(childBox) - 1));
}

// Rollback visitor: adds back one reference for every internal edge that was
// subtracted. Only GRAY children were decremented, so this exactly inverts
// enqueueCycleChild for the parents that were fully processed.
inline void restoreCycleChild(const TypeInfo *, void *childBox) noexcept {
	if (colorOf(childBox) == COLOR_GRAY) {
		setRefCount(childBox, (uint16_t)(refCountOf(childBox) + 1));
	}
}

// Breadth-first subtract pass. Returns false (after restoring refcounts and
// colors) if the graph does not fit in the worklist.
//
// Only this phase pushes entries: the survivor pass and the white phase iterate
// the already-recorded array in place, so they cannot overflow and need no
// rollback. During marking, an overflow is detected before the offending child
// is decremented or registered, so the only mutations to undo are the edges of
// the parents already processed.
//
// Rollback is possible because the array keeps every enqueued node in BFS
// order and each node appears once: the first `processedCount` entries had all
// their outgoing edges subtracted, and restoring is a replay of their trace
// over GRAY children. Colors are then reset to their pre-collection value
// (purple for the candidate prefix, black for nodes discovered later). No box
// is freed before the white phase, so every recorded box is still valid.
inline bool markCycleGray(CycleCollector &collector) noexcept {
	collector.traceOverflow = false;
	uint16_t cursor = 0;
	while (cursor < collector.recordCount && !collector.traceOverflow) {
		collector.processedCount = (uint16_t)(cursor + 1);
		void *box = collector.records[cursor].box;
		const TypeInfo *type = collector.records[cursor].type;
		if (type->trace) {
			type->trace(box, &enqueueCycleChild);
		}
		cursor = (uint16_t)(cursor + 1);
	}
	if (!collector.traceOverflow) {
		return true;
	}
	for (uint16_t i = 0; i < collector.processedCount; i++) {
		const TypeInfo *type = collector.records[i].type;
		if (type->trace) {
			type->trace(collector.records[i].box, &restoreCycleChild);
		}
	}
	for (uint16_t i = 0; i < collector.recordCount; i++) {
		const uint16_t restoredColor = (i < collector.candidateCount) ? COLOR_PURPLE : COLOR_BLACK;
		setColor(collector.records[i].box, restoredColor);
	}
	collector.recordCount = 0;
	collector.processedCount = 0;
	return false;
}

// --- scan: decide which of the marked nodes are reachable from outside ------

// After markGray every recorded refcount equals its external references (all
// internal edges were subtracted). Marking the survivor set is a pure color
// closure — reachable children of a survivor survive — repeated until stable,
// so it needs no recursion and no refcount changes. Only once the set is final
// is each edge between survivors restored exactly once.
inline void markBlackChild(const TypeInfo *, void *childBox) noexcept {
	CycleCollector &collector = cycleCollector();
	if (colorOf(childBox) != COLOR_BLACK) {
		setColor(childBox, COLOR_BLACK);
		collector.closureChanged = true;
	}
}

inline void markCycleSurvivors(CycleCollector &collector) noexcept {
	bool changed = true;
	while (changed) {
		changed = false;
		for (uint16_t i = 0; i < collector.recordCount; i++) {
			void *box = collector.records[i].box;
			if (colorOf(box) == COLOR_GRAY && refCountOf(box) > 0) {
				setColor(box, COLOR_BLACK);
				changed = true;
			}
		}
		collector.closureChanged = false;
		for (uint16_t i = 0; i < collector.recordCount; i++) {
			void *box = collector.records[i].box;
			const TypeInfo *type = collector.records[i].type;
			if (colorOf(box) == COLOR_BLACK && type->trace) {
				type->trace(box, &markBlackChild);
			}
		}
		if (collector.closureChanged) {
			changed = true;
		}
	}
	for (uint16_t i = 0; i < collector.recordCount; i++) {
		void *box = collector.records[i].box;
		if (colorOf(box) == COLOR_GRAY) {
			setColor(box, COLOR_WHITE);
		}
	}
}

inline void incrementBlackChild(const TypeInfo *, void *childBox) noexcept {
	setRefCount(childBox, (uint16_t)(refCountOf(childBox) + 1));
}

inline void restoreCycleReferences(CycleCollector &collector) noexcept {
	for (uint16_t i = 0; i < collector.recordCount; i++) {
		void *box = collector.records[i].box;
		const TypeInfo *type = collector.records[i].type;
		if (colorOf(box) == COLOR_BLACK && type->trace) {
			type->trace(box, &incrementBlackChild);
		}
	}
}

// --- collectWhite: destroy the garbage, without double free -----------------

// Whites are garbage: their refcounts are already 0 (they had no external
// reference). Their destructors run while `collectingWhites` is set, so any
// handle they release is checked against the collection: a registered box
// (another white, or a survivor whose subtracted edge was deliberately not
// restored) is skipped, because the collector owns its lifetime from here on;
// a leaf that no `trace` ever reported is NOT registered, so its release is
// normal — it decrements and frees when it reaches 0, which is what reclaims
// string/array boxes owned only by garbage. That release can cascade into more
// leaf releases (still normal) and never re-registers candidates, because
// `noteRelease` is a no-op while the collector is running.
inline void destroyCycleWhites(CycleCollector &collector) noexcept {
	collector.collectingWhites = true;
	for (uint16_t i = 0; i < collector.recordCount; i++) {
		void *box = collector.records[i].box;
		const TypeInfo *type = collector.records[i].type;
		if (colorOf(box) == COLOR_WHITE) {
			setColor(box, COLOR_BLACK);
			type->destroy(box);
		}
	}
	collector.collectingWhites = false;
}

inline void forgetCandidate(void *box) noexcept {
	CycleCollector &collector = cycleCollector();
	if (collector.running) {
		return;
	}
	for (uint16_t i = 0; i < collector.candidateCount; i++) {
		if (collector.records[i].box != box) {
			continue;
		}
		const uint16_t last = (uint16_t)(collector.candidateCount - 1);
		collector.records[i] = collector.records[last];
		collector.candidateCount = last;
		return;
	}
}

// A release left the box alive: mark it purple and register it. If the list is
// full the box is left purple but unregistered (a collection is skipped, per
// the fixed-worklist contract). The collector is never run from here: the
// caller's release is still unwinding and could collect the very box whose
// refcount it just changed, so candidates are drained from allocateRefBox
// instead.
inline void noteRelease(void *box, const TypeInfo *type) noexcept {
	// A leaf (no `trace`) cannot point back into a cycle, so it is never a
	// candidate. Skipping it keeps the fixed registry for boxes that can
	// actually form one (objects, arrays of handles).
	if (!type->trace) {
		return;
	}
	CycleCollector &collector = cycleCollector();
	if (collector.running) {
		return;
	}
	if (colorOf(box) == COLOR_PURPLE) {
		return;
	}
	setColor(box, COLOR_PURPLE);
	if (collector.candidateCount < E95_CYCLES_WORKLIST) {
		const uint16_t index = collector.candidateCount;
		collector.records[index].box = box;
		collector.records[index].type = type;
		collector.candidateCount = (uint16_t)(index + 1);
	}
}

// Acquiring a purple box means it is reachable again: back to black and out of
// the candidate registry.
inline void noteAcquire(void *box) noexcept {
	if (colorOf(box) != COLOR_PURPLE) {
		return;
	}
	setColor(box, COLOR_BLACK);
	forgetCandidate(box);
}

inline void collectCycles() noexcept {
	CycleCollector &collector = cycleCollector();
	if (collector.running || collector.candidateCount == 0) {
		return;
	}
	collector.running = true;
	collector.recordCount = collector.candidateCount;
	collector.processedCount = 0;
	for (uint16_t i = 0; i < collector.candidateCount; i++) {
		setColor(collector.records[i].box, COLOR_GRAY);
	}
	if (markCycleGray(collector)) {
		markCycleSurvivors(collector);
		restoreCycleReferences(collector);
		destroyCycleWhites(collector);
		collector.candidateCount = 0;
	}
	collector.recordCount = 0;
	collector.processedCount = 0;
	collector.running = false;
}

#else

inline void collectCycles() noexcept {}

#endif

// A type-erased, shared-mutable handle to a refcounted heap value.
//
// It is the non-template base of Ref<T>: the refcount lives at offset 0 of the
// box, so copy/assign/dtor can adjust it through a void* without knowing T, and
// the per-type `TypeInfo` knows how to run the payload's destructor, free the
// block and (when cycles are enabled) trace its child handles. This is what
// lets generated code carry an `object` of any shape as one owning handle (any
// Object<Fields> converts implicitly to AnyObject), preserving the TS
// object-sharing semantics from behavior.md.
//
// Sharing rules (the invariant the plan relies on):
//   - copy        -> acquire (refs +1); the copy's dtor releases it.
//   - move        -> steals the box, no acquire; the moved-from handle is null.
//   - copy assign -> releases the old target, then acquires the new one.
//   - move assign -> releases the old target, then steals the new box.
//   - dtor        -> release; when refs hits 0 the value and box are freed.
class AnyObject {
public:
	AnyObject() noexcept : box_(nullptr), value_(nullptr), type_(nullptr) {}

	AnyObject(const AnyObject &other) noexcept
		: box_(other.box_), value_(other.value_), type_(other.type_) {
		acquire();
	}

	AnyObject(AnyObject &&other) noexcept
		: box_(other.box_), value_(other.value_), type_(other.type_) {
		clearSource(other);
	}

	AnyObject &operator=(const AnyObject &other) noexcept {
		if (this != &other) {
			release();
			box_ = other.box_;
			value_ = other.value_;
			type_ = other.type_;
			acquire();
		}
		return *this;
	}

	AnyObject &operator=(AnyObject &&other) noexcept {
		if (this != &other) {
			if (box_ == other.box_) {
				// Already aliasing the same box: the only change is that the
				// moved-from handle stops referencing it, so drop that one ref.
				release();
			} else {
				release();
				box_ = other.box_;
				value_ = other.value_;
				type_ = other.type_;
			}
			clearSource(other);
		}
		return *this;
	}

	~AnyObject() {
		release();
	}

	// Observers.
	bool hasValue() const noexcept {
		return box_ != nullptr;
	}

	uint16_t refCount() const noexcept {
		return box_ ? refCountOf(box_) : 0;
	}

	// The pointee's storage, type-erased. Cast it back to the concrete storage
	// struct to mutate the shared fields in place.
	void *pointer() const noexcept {
		return value_;
	}

	// The per-type vtable this handle was created with.
	const TypeInfo *typeInfo() const noexcept {
		return type_;
	}

	// Reports this handle as a child of the value currently being traced. A
	// null handle is simply skipped (absent optional children have no box).
	void traceChild(TraceVisitor visit) const noexcept {
		if (box_ && visit) {
			visit(type_, box_);
		}
	}

protected:
	void *box_;

	// Adopts an already-constructed box (refs = 1) without acquiring.
	template <typename T>
	explicit AnyObject(RefBox<T> *box) noexcept
		: box_(box), value_(&box->value), type_(TypeInfoOf<T>::get()) {}

	// Adopts a box with an explicit TypeInfo (a type whose trace/destroy are
	// provided by a hand-written specialization rather than TypeInfoOf<T>).
	template <typename T>
	AnyObject(RefBox<T> *box, const TypeInfo *type) noexcept
		: box_(box), value_(&box->value), type_(type) {}

private:
	void *value_;
	const TypeInfo *type_;

	uint16_t acquireCount() const noexcept {
		return refCountOf(box_);
	}

	void acquire() noexcept {
		if (!box_) {
			return;
		}
#if E95_CYCLES
		noteAcquire(box_);
#endif
		if (acquireCount() < REF_COUNT_MAX) {
			setRefCount(box_, (uint16_t)(acquireCount() + 1));
		}
	}

	void release() noexcept {
		if (!box_) {
			return;
		}
#if E95_CYCLES
		CycleCollector &collector = cycleCollector();
		// During the white phase, boxes the collector registered (whites it will
		// destroy, and survivors whose internal edge was not restored) must not
		// be released here. A box no `trace` ever reported is NOT registered, so
		// its release is genuine and reclaims the leaf on its way to 0.
		if (collector.collectingWhites && isRecordedBox(collector, box_)) {
			return;
		}
#endif
		const uint16_t current = acquireCount();
		if (current == 0) {
			return;
		}
		const uint16_t remaining = (uint16_t)(current - 1);
		setRefCount(box_, remaining);
		if (remaining == 0) {
#if E95_CYCLES
			forgetCandidate(box_);
#endif
			type_->destroy(box_);
			return;
		}
#if E95_CYCLES
		noteRelease(box_, type_);
#endif
	}

	static void clearSource(AnyObject &other) noexcept {
		other.box_ = nullptr;
		other.value_ = nullptr;
		other.type_ = nullptr;
	}
};

// Allocation helper: on failure, reclaim cycles once and retry, so a program
// whose heap is full of unreachable cycles can keep running. Still returns
// null (never throws) if the retry fails. A full candidate registry is drained
// here too (never from inside release), which bounds the number of unregistered
// purple boxes between allocations.
template <typename T>
RefBox<T> *allocateRefBox() noexcept {
#if E95_CYCLES
	if (cycleCollector().candidateCount >= E95_CYCLES_WORKLIST) {
		collectCycles();
	}
#endif
	RefBox<T> *box = (RefBox<T> *)malloc(sizeof(RefBox<T>));
#if E95_CYCLES
	if (!box) {
		collectCycles();
		box = (RefBox<T> *)malloc(sizeof(RefBox<T>));
	}
#endif
	return box;
}

// A typed shared-mutable handle to a refcounted heap value. Ref<T> adds the
// concrete T& accessors on top of the type-erased AnyObject base, so the same
// handle can be passed where only the owning/sharing behavior is needed.
//
// Ref<T> itself never allocates on copy/assign/dtor, only Ref<T>::emplace and
// clone() do; an allocation failure yields a null handle rather than a throw,
// matching the no-exceptions embedded runtime.
template <typename T>
class Ref : public AnyObject {
public:
	Ref() noexcept : AnyObject() {}

	Ref(const Ref &other) noexcept : AnyObject(other) {}

	Ref(Ref &&other) noexcept : AnyObject(static_cast<AnyObject &&>(other)) {}

	Ref &operator=(const Ref &other) noexcept {
		AnyObject::operator=(other);
		return *this;
	}

	Ref &operator=(Ref &&other) noexcept {
		AnyObject::operator=(static_cast<AnyObject &&>(other));
		return *this;
	}

	// Allocates a new independently-owned value built from the given args
	// (refs = 1), tagging the box with `type`. Lets a caller whose TypeInfo is
	// not `TypeInfoOf<T>` (e.g. `Array<T>`'s `Storage<T>`, which traces its
	// elements) provide it explicitly. Returns a null handle on allocation
	// failure.
	template <typename... Args>
	static Ref emplaceWithType(const TypeInfo *type, Args &&...args) noexcept {
		RefBox<T> *box = allocateRefBox<T>();
		if (!box) {
			return Ref();
		}
		box->refs = 1;
		new (&box->value) T(static_cast<Args &&>(args)...);
		return Ref(box, type);
	}

	// Allocates a new independently-owned value with the default TypeInfo.
	template <typename... Args>
	static Ref emplace(Args &&...args) noexcept {
		return emplaceWithType(TypeInfoOf<T>::get(), static_cast<Args &&>(args)...);
	}

	// CoW precursor: produces an independent copy (refs = 1) of the shared
	// value, preserving its TypeInfo.
	Ref<T> clone() const noexcept {
		if (!hasValue()) {
			return Ref<T>();
		}
		return emplaceWithType(typeInfo(), get());
	}

	T &get() noexcept {
		return typed()->value;
	}

	const T &get() const noexcept {
		return typed()->value;
	}

	T *pointer() noexcept {
		return hasValue() ? &typed()->value : nullptr;
	}

	const T *pointer() const noexcept {
		return hasValue() ? &typed()->value : nullptr;
	}

	T &operator*() noexcept {
		return typed()->value;
	}

	const T &operator*() const noexcept {
		return typed()->value;
	}

	T *operator->() noexcept {
		return &typed()->value;
	}

	const T *operator->() const noexcept {
		return &typed()->value;
	}

	void reset() noexcept {
		AnyObject::operator=(AnyObject());
	}

private:
	explicit Ref(RefBox<T> *box) noexcept : AnyObject(box) {}

	Ref(RefBox<T> *box, const TypeInfo *type) noexcept : AnyObject(box, type) {}

	RefBox<T> *typed() const noexcept {
		return (RefBox<T> *)box_;
	}
};

} // namespace core_mem

#endif // _E95_MEMORY_REF_H


#endif
