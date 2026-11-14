#ifndef _E95_ARRAY_H
#define _E95_ARRAY_H

#include <core_type.h>
#include <core_memory.h>
#include <new>
#include <stdlib.h>

namespace core_array {

// Shared array declarations, platform-agnostic.
// Inlined into each platform's _e95_array.h via _e95_replace_common.

// --- Shared-mutable Array on the refcount motor --------------------------
//
// An Array<T> is a Ref<Storage<T>> handle (core_mem::Ref from core_memory.h):
// copying shares the Storage (alias), and push/pop/[] through any handle are
// visible to the others (TS shared-mutable, NOT copy-on-write). Storage lives in
// one refcounted heap block; the elements live in a separate contiguous T*
// buffer that grows geometrically. T must be trivially relocatable (realloc
// moves elements by bit copy).

using core_mem::Ref;

// Declared before the traits below so `Array<T>` can be recognized as a handle
// even though its definition comes later in this file.
template <typename T>
class Array;

namespace detail {
// Capacity floor: fresh arrays start here and shrinking never goes below it.
const u16 ARRAY_MIN_CAPACITY = 5;
const u16 ARRAY_CAPACITY_MAX = 65535;
} // namespace detail

template <typename T>
struct Storage {
	T *data = nullptr;
	u16 size = 0;
	u16 capacity = 0;

	~Storage() {
		destroyElements();
	}

	void ensureCapacity(u16 need) {
		if (capacity >= need) {
			return;
		}
		u16 newCapacity = capacity + (u16)(capacity / 4) + 1;
		if (newCapacity < capacity) {
			// saturation guard: a u16 overflow must never shrink capacity
			newCapacity = detail::ARRAY_CAPACITY_MAX;
		}
		if (newCapacity < detail::ARRAY_MIN_CAPACITY) {
			newCapacity = detail::ARRAY_MIN_CAPACITY;
		}
		if (newCapacity < need) {
			newCapacity = need;
		}
		void *newData = realloc(data, (size_t)newCapacity * sizeof(T));
		if (!newData) {
			return; // OOM: leave the buffer intact
		}
		data = (T *)newData;
		capacity = newCapacity;
	}

	void destroyElements() {
		if (data) {
			for (u16 i = 0; i < size; i++) {
				data[i].~T();
			}
			free(data);
			data = nullptr;
			size = 0;
			capacity = 0;
		}
	}
};

namespace detail {
// Compile-time classification of an array element: a handle derives from
// `core_mem::AnyObject` (Object<...>, AnyObject itself, nested Array<T>), so it
// is detected by pointer convertibility without naming `core_object` (which may
// not be declared yet at this point) or pulling in <type_traits>. Scalars and
// String do not derive from AnyObject: an array of them cannot form a cycle.
struct NoCycleHandleTag {};
struct CycleHandleTag {};

template <bool IsHandle>
struct CycleHandleTagOf;

template <>
struct CycleHandleTagOf<true> {
	typedef CycleHandleTag Type;
};

template <>
struct CycleHandleTagOf<false> {
	typedef NoCycleHandleTag Type;
};

template <typename T>
struct IsCycleHandle {
	static char detect(core_mem::AnyObject *);
	static long detect(...);
	static const bool value =
		sizeof(detect(static_cast<T *>(0))) == sizeof(char);
	typedef typename CycleHandleTagOf<value>::Type Type;
};

// Array<T> is a value wrapper around its Ref<Storage<T>>, so it does not derive
// from AnyObject; it exposes traceChild explicitly and is a handle when nested.
template <typename T>
struct IsCycleHandle<Array<T>> {
	typedef CycleHandleTag Type;
};

template <typename T>
void traceHandleImpl(T &value, core_mem::TraceVisitor visit, CycleHandleTag) {
	value.traceChild(visit);
}

template <typename T>
void traceHandleImpl(T &, core_mem::TraceVisitor, NoCycleHandleTag) {}

template <typename T>
void traceHandle(T &value, core_mem::TraceVisitor visit) {
	traceHandleImpl(value, visit, typename IsCycleHandle<T>::Type());
}

template <typename T>
void traceStorage(void *box, core_mem::TraceVisitor visit) {
	core_mem::RefBox<Storage<T>> *typed = (core_mem::RefBox<Storage<T>> *)box;
	Storage<T> *storage = &typed->value;
	for (u16 i = 0; i < storage->size; i++) {
		traceHandle(storage->data[i], visit);
	}
}

typedef void (*StorageTraceFunction)(void *box, core_mem::TraceVisitor visit);

template <typename T>
StorageTraceFunction storageTrace(CycleHandleTag) {
	return &traceStorage<T>;
}

template <typename T>
StorageTraceFunction storageTrace(NoCycleHandleTag) {
	return nullptr;
}

// TypeInfo for an array's Storage<T>. `trace` is null for a leaf element type
// (nothing to walk) and non-null only when the elements are handles, so a
// scalar array never becomes a collection candidate.
template <typename T>
struct ArrayStorageTypeInfo {
	static const core_mem::TypeInfo *get() noexcept {
		static const core_mem::TypeInfo typeInfo = {
			&core_mem::destroyRefBox<Storage<T>>,
			storageTrace<T>(typename IsCycleHandle<T>::Type()),
		};
		return &typeInfo;
	}
};
} // namespace detail

template <typename T>
class Array {
public:
	Array() : storage_(makeStorage()) {
		storage_->ensureCapacity(detail::ARRAY_MIN_CAPACITY);
	}

	// Constructs from element initializer values. The first parameter is a
	// concrete `T` (not a forwarding ref) so this template never hijacks copy /
	// move construction from another Array (copy construction is required for
	// the TS alias model).
	template <typename... Rest>
	Array(T first, Rest &&... rest) : storage_(makeStorage()) {
		storage_->ensureCapacity((u16)(1 + sizeof...(Rest)));
		push(T(first));
		pushConstructed(static_cast<Rest &&>(rest)...);
	}

	// Copy shares the Storage (alias); ~Array and Ref handle the refcount.
	Array(const Array &other) = default;

	Array(Array &&other) noexcept : storage_(static_cast<Ref<Storage<T>> &&>(other.storage_)) {}

	Array &operator=(const Array &other) {
		storage_ = other.storage_;
		return *this;
	}

	Array &operator=(Array &&other) noexcept {
		storage_ = static_cast<Ref<Storage<T>> &&>(other.storage_);
		return *this;
	}

	void push(T &&value) {
		ensureStorage();
		Storage<T> &storage = storage_.get();
		storage.ensureCapacity((u16)(storage.size + 1));
		if (storage.size >= storage.capacity) {
			return; // OOM: leave the array intact
		}
		new (&storage.data[storage.size]) T(static_cast<T &&>(value));
		storage.size++;
	}

	void push(const T &value) {
		ensureStorage();
		Storage<T> &storage = storage_.get();
		storage.ensureCapacity((u16)(storage.size + 1));
		if (storage.size >= storage.capacity) {
			return;
		}
		new (&storage.data[storage.size]) T(value);
		storage.size++;
	}

	// Grow-only: makes room for at least `newCapacity` elements (never shrinks).
	void reserve(u16 newCapacity) {
		ensureStorage();
		storage_->ensureCapacity(newCapacity);
	}

	// Drops the trailing elements beyond `newSize` (destroying them). Used by the
	// event loop to compact the queue in place after a sweep.
	void truncate(u16 newSize) {
		if (!storage_.hasValue()) {
			return;
		}
		Storage<T> &storage = storage_.get();
		if (newSize >= storage.size) {
			return;
		}
		for (u16 i = newSize; i < storage.size; i++) {
			storage.data[i].~T();
		}
		storage.size = newSize;
	}

	// Shrinks the capacity to `newCapacity`, clamped to at least the current size
	// and the shared floor. The explicit counterpart to grow-only `reserve`.
	void shrink(u16 newCapacity) {
		if (!storage_.hasValue()) {
			return;
		}
		Storage<T> &storage = storage_.get();
		if (newCapacity < storage.size) {
			newCapacity = storage.size;
		}
		if (newCapacity < detail::ARRAY_MIN_CAPACITY) {
			newCapacity = detail::ARRAY_MIN_CAPACITY;
		}
		if (newCapacity >= storage.capacity) {
			return;
		}
		void *newData = realloc(storage.data, (size_t)newCapacity * sizeof(T));
		if (!newData) {
			return; // OOM: leave the buffer intact
		}
		storage.data = (T *)newData;
		storage.capacity = newCapacity;
	}

	void pop() {
		if (!storage_.hasValue()) {
			return;
		}
		Storage<T> &storage = storage_.get();
		if (storage.size == 0) {
			return;
		}
		storage.size--;
		storage.data[storage.size].~T();
		if (storage.size <= storage.capacity / 2 && storage.capacity > detail::ARRAY_MIN_CAPACITY) {
			u16 newCapacity = storage.capacity / 2;
			if (newCapacity < detail::ARRAY_MIN_CAPACITY) {
				newCapacity = detail::ARRAY_MIN_CAPACITY;
			}
			void *newData = realloc(storage.data, (size_t)newCapacity * sizeof(T));
			if (newData) {
				storage.data = (T *)newData;
				storage.capacity = newCapacity;
			}
		}
	}

	T &operator[](u16 index) {
		return storage_.get().data[index];
	}

	const T &operator[](u16 index) const {
		return storage_.get().data[index];
	}

	u16 length() const {
		return storage_.hasValue() ? storage_.get().size : 0;
	}

	u16 capacity() const {
		return storage_.hasValue() ? storage_.get().capacity : 0;
	}

	T *raw() {
		return storage_.hasValue() ? storage_.get().data : nullptr;
	}

	const T *raw() const {
		return storage_.hasValue() ? storage_.get().data : nullptr;
	}

	// Reports the Storage handle as a child of the value currently being traced.
	// An Array is stored by value inside an object (or another struct) but its
	// elements live in a refcounted Storage box, so the collector must see that
	// box to walk `Array<Object<...>>` graphs.
	void traceChild(core_mem::TraceVisitor visit) const {
		storage_.traceChild(visit);
	}

private:
	static Ref<Storage<T>> makeStorage() {
		return Ref<Storage<T>>::emplaceWithType(
			detail::ArrayStorageTypeInfo<T>::get());
	}

	void ensureStorage() {
		if (!storage_.hasValue()) {
			storage_ = makeStorage();
		}
	}

	void pushConstructed() {}

	template <typename Arg, typename... Rest>
	void pushConstructed(Arg &&arg, Rest &&... rest) {
		push(T(static_cast<Arg &&>(arg)));
		pushConstructed(static_cast<Rest &&>(rest)...);
	}

	Ref<Storage<T>> storage_;
};


} // namespace core_array

#endif
