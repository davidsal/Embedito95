// Candidate next-gen shared-mutable Array<T> backed by the core_mem::Ref
// refcount motor.
//
// NOT WIRED: nothing in the codegen references this yet. It is validated on the
// host by runtime-tests/array-ref.test.cpp before it supersedes array.common.h
// (see todayPlan.md "gestión de memoria" / "re-expresar Array<T> sobre Ref").
// It is deliberately self-contained (only <stdlib.h>/<stdint.h>/<new> plus the
// memory motor) so the host toolchain can compile it without the platform
// typedefs (u8/u16). The swap step will move it into array.common.h and restore
// the core_type include and the platform growth-divisor marker.
//
// Semantics (TS-like, shared-mutable, NOT copy-on-write):
//   - copy        -> shares the Storage (alias); push/pop/[] through any handle
//                    are visible to all the others.
//   - move        -> steals the Storage; the moved-from Array is empty.
//   - reassign    -> points the handle at the new Storage (local); the caller's
//                    array is untouched.
//   - dtor        -> release; the Storage (and its element buffer) is freed when
//                    the last handle to it is destroyed.

#ifndef _E95_ARRAY_REF_H
#define _E95_ARRAY_REF_H

#include "../memory/ref.h"

#include <new>
#include <stdint.h>
#include <stdlib.h>

namespace core_array {

using core_mem::Ref;

namespace detail {
// Capacity floor: fresh arrays start here and shrinking never goes below it.
const uint16_t ARRAY_REF_MIN_CAPACITY = 5;
const uint16_t ARRAY_REF_GROWTH_DIVISOR = 4; // ~1.25x: capacity + cap/divisor + 1
const uint16_t ARRAY_REF_U16_MAX = 65535;
} // namespace detail

// Shared, growable element storage. Elements live in a contiguous T* buffer.
//
// Note: growth reallocs the raw buffer, so T must be trivially relocatable (the
// same requirement array.common.h has today). An Array<T> is a Ref<Storage<T>>:
// copying an Array shares this same object.
template <typename T>
struct Storage {
	T *data = nullptr;
	uint16_t size = 0;
	uint16_t capacity = 0;

	~Storage() {
		destroyElements();
	}

	void ensureCapacity(uint16_t need) {
		if (capacity >= need) {
			return;
		}
		uint16_t newCapacity = capacity + (capacity / detail::ARRAY_REF_GROWTH_DIVISOR) + 1;
		if (newCapacity < capacity) {
			// saturation guard: a u16 overflow must never shrink capacity
			newCapacity = detail::ARRAY_REF_U16_MAX;
		}
		if (newCapacity < detail::ARRAY_REF_MIN_CAPACITY) {
			newCapacity = detail::ARRAY_REF_MIN_CAPACITY;
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
			for (uint16_t i = 0; i < size; i++) {
				data[i].~T();
			}
			free(data);
			data = nullptr;
			size = 0;
			capacity = 0;
		}
	}
};

template <typename T>
class Array {
public:
	Array() : storage_(Ref<Storage<T>>::emplace()) {
		storage_->ensureCapacity(detail::ARRAY_REF_MIN_CAPACITY);
	}

	// Constructs from element initializer values. The first parameter is a
	// concrete `T` (not a forwarding ref) so this template never hijacks copy /
	// move construction from another Array (copy construction is required for
	// the TS alias model, see scenarioCopySharesAlias in the host tests).
	template <typename... Rest>
	Array(T first, Rest &&... rest) : storage_(Ref<Storage<T>>::emplace()) {
		storage_->ensureCapacity((uint16_t)(1 + sizeof...(Rest)));
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
		Storage<T> &s = storage_.get();
		s.ensureCapacity((uint16_t)(s.size + 1));
		if (s.size >= s.capacity) {
			return; // OOM: leave the array intact
		}
		new (&s.data[s.size]) T(static_cast<T &&>(value));
		s.size++;
	}

	void push(const T &value) {
		ensureStorage();
		Storage<T> &s = storage_.get();
		s.ensureCapacity((uint16_t)(s.size + 1));
		if (s.size >= s.capacity) {
			return;
		}
		new (&s.data[s.size]) T(value);
		s.size++;
	}

	// Grow-only: makes room for at least `newCapacity` elements (never shrinks).
	void reserve(uint16_t newCapacity) {
		ensureStorage();
		storage_->ensureCapacity(newCapacity);
	}

	void pop() {
		if (!storage_.hasValue()) {
			return;
		}
		Storage<T> &s = storage_.get();
		if (s.size == 0) {
			return;
		}
		s.size--;
		s.data[s.size].~T();
		if (s.size <= s.capacity / 2 && s.capacity > detail::ARRAY_REF_MIN_CAPACITY) {
			uint16_t newCapacity = s.capacity / 2;
			if (newCapacity < detail::ARRAY_REF_MIN_CAPACITY) {
				newCapacity = detail::ARRAY_REF_MIN_CAPACITY;
			}
			void *newData = realloc(s.data, (size_t)newCapacity * sizeof(T));
			if (newData) {
				s.data = (T *)newData;
				s.capacity = newCapacity;
			}
		}
	}

	T &operator[](uint16_t index) {
		return storage_.get().data[index];
	}

	const T &operator[](uint16_t index) const {
		return storage_.get().data[index];
	}

	uint16_t length() const {
		return storage_.hasValue() ? storage_.get().size : 0;
	}

	uint16_t capacity() const {
		return storage_.hasValue() ? storage_.get().capacity : 0;
	}

	T *raw() {
		return storage_.hasValue() ? storage_.get().data : nullptr;
	}

	const T *raw() const {
		return storage_.hasValue() ? storage_.get().data : nullptr;
	}

private:
	void ensureStorage() {
		if (!storage_.hasValue()) {
			storage_ = Ref<Storage<T>>::emplace();
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

#endif // _E95_ARRAY_REF_H
