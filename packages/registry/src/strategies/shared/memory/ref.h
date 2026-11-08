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

#ifndef _E95_MEMORY_REF_H
#define _E95_MEMORY_REF_H

#include <new>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>

namespace core_mem {

// Heap block that owns a payload plus its reference count. The refcount lives
// in the same allocation as the value so a single free() releases everything.
template <typename T>
struct RefBox {
	uint16_t refs;
	T value;
};

// A type-erased, shared-mutable handle to a refcounted heap value.
//
// It is the non-template base of Ref<T>: the refcount lives at offset 0 of the
// box, so copy/assign/dtor can adjust it through a void* without knowing T, and
// `destroy_` knows how to run the payload's destructor and free the block. This
// is what lets generated code carry an `object` of any shape as one owning
// handle (any Object<Fields> converts implicitly to AnyObject), preserving the
// TS object-sharing semantics from behavior.md.
//
// Sharing rules (the invariant the plan relies on):
//   - copy        -> acquire (refs +1); the copy's dtor releases it.
//   - move        -> steals the box, no acquire; the moved-from handle is null.
//   - copy assign -> releases the old target, then acquires the new one.
//   - move assign -> releases the old target, then steals the new box.
//   - dtor        -> release; when refs hits 0 the value and box are freed.
class AnyObject {
public:
	AnyObject() noexcept : box_(nullptr), value_(nullptr), destroy_(nullptr) {}

	AnyObject(const AnyObject &other) noexcept
		: box_(other.box_), value_(other.value_), destroy_(other.destroy_) {
		acquire();
	}

	AnyObject(AnyObject &&other) noexcept
		: box_(other.box_), value_(other.value_), destroy_(other.destroy_) {
		clearSource(other);
	}

	AnyObject &operator=(const AnyObject &other) noexcept {
		if (this != &other) {
			release();
			box_ = other.box_;
			value_ = other.value_;
			destroy_ = other.destroy_;
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
				destroy_ = other.destroy_;
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
		return box_ ? refs() : 0;
	}

	// The pointee's storage, type-erased. Cast it back to the concrete storage
	// struct to mutate the shared fields in place.
	void *pointer() const noexcept {
		return value_;
	}

protected:
	void *box_;

	// Adopts an already-constructed box (refs = 1) without acquiring.
	template <typename T>
	explicit AnyObject(RefBox<T> *box) noexcept
		: box_(box), value_(&box->value), destroy_(&destroyBox<T>) {}

private:
	void *value_;
	void (*destroy_)(void *);

	template <typename T>
	static void destroyBox(void *box) noexcept {
		RefBox<T> *typed = (RefBox<T> *)box;
		typed->value.~T();
		free(typed);
	}

	uint16_t &refs() const noexcept {
		return *(uint16_t *)box_;
	}

	void acquire() noexcept {
		if (box_) {
			refs()++;
		}
	}

	void release() noexcept {
		if (box_ && --refs() == 0) {
			destroy_(box_);
		}
	}

	static void clearSource(AnyObject &other) noexcept {
		other.box_ = nullptr;
		other.value_ = nullptr;
		other.destroy_ = nullptr;
	}
};

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
	// (refs = 1). Returns a null handle if the allocation fails.
	template <typename... Args>
	static Ref emplace(Args &&...args) noexcept {
		RefBox<T> *box = (RefBox<T> *)malloc(sizeof(RefBox<T>));
		if (!box) {
			return Ref();
		}
		box->refs = 1;
		new (&box->value) T(static_cast<Args &&>(args)...);
		return Ref(box);
	}

	// CoW precursor: produces an independent copy (refs = 1) of the shared
	// value. Used by a writer that wants to diverge from the other sharers.
	Ref<T> clone() const noexcept {
		if (!hasValue()) {
			return Ref<T>();
		}
		return emplace(get());
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

	RefBox<T> *typed() const noexcept {
		return (RefBox<T> *)box_;
	}
};

} // namespace core_mem

#endif // _E95_MEMORY_REF_H
