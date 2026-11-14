#ifndef _E95_OBJECT_H
#define _E95_OBJECT_H

#include <core_memory.h>
#include <new>
#include <stdint.h>
#include <stdlib.h>

namespace core_object {

// Shared object handle, platform-agnostic. Single source of the
// core_object::Object<Fields> template.
//
// Inlined into each platform's _e95_object.h via _e95_replace_common (inside a
// `namespace core_object` opened by the wrapper), and #included by the host-only
// object_ref.h so runtime-tests compile the exact same body.
//
// Objects are heterogeneous (each `object:{...}` shape has its own fields), so
// there is no single runtime header to mirror like Array<T>. What every shape
// shares is that a value of object type is a REFCOUNTED HANDLE whose *storage*
// holds the fields. The codegen emits, per shape, a plain fields struct and
// aliases the handle:
//
//   struct Point_Fields { int16_t x; int16_t y; };   // per-shape storage
//   using Point = core_object::Object<Point_Fields>;
//
// Field access `obj.a` / `obj.a = v` is emitted by the codegen as `obj.get().a`
// / `obj.get().a = v`; the handle forwards to the shared storage. Fields whose
// type is a reference type (string / array / a nested object) are themselves
// stored as their handle, so freeing the root storage runs each member's
// destructor and releases the nested blocks in cascade.
//
// Semantics (TS-like, shared-mutable, NOT copy-on-write — like Array, NOT like
// String): assignment `let b = a` aliases storage (refs+1); passing `f(obj)`
// crosses the call as a handle copy (refs+1) so field mutations reach the
// caller; reassigning a param/var rebinds only the local handle; move steals
// the storage (moved-from is empty); dtor releases, freeing storage (and every
// nested handle) when refs hit 0. A field aliasing an ancestor
// (`obj.child = obj`) forms a reference cycle: with cycles enabled the
// trial-deletion collector reclaims it (see ../memory/ref.h), and with
// `cycles: "off"` it leaks under the plain refcount.

using core_mem::Ref;

// A shared-mutable handle to a refcounted object. `Fields` is the per-shape
// storage struct the codegen emits (all members owned by value). Object is-a
// Ref<Fields>, so it inherits the RAII sharing rules and forwards field access
// through operator->/get(); codegen never stores the storage by value.
//
// Because Ref<Fields> derives from core_mem::AnyObject, any Object<Fields>
// converts implicitly to that type-erased owning handle. The codegen uses it for
// the generic `object` type (e.g. the async task payload), so an object of any
// shape can be stored/passed as one sharing handle (refs+1) without knowing its
// fields at that point.
template <typename Fields>
class Object : public Ref<Fields> {
public:
	// A fresh, independently-owned object (its own storage, refs = 1).
	Object() : Ref<Fields>(Ref<Fields>::emplace()) {}

	// Builds a fresh object from an initializer fields value (refs = 1). On
	// allocation failure the handle is null (no throw, embedded-friendly).
	explicit Object(const Fields &fields) : Ref<Fields>(Ref<Fields>::emplace(fields)) {}

	// Copy aliases the same storage (TS object sharing); ~Object / Ref manage
	// the refcount.
	Object(const Object &other) : Ref<Fields>(other) {}
	Object &operator=(const Object &other) {
		Ref<Fields>::operator=(other);
		return *this;
	}

	// Move steals the storage; the moved-from object is null/empty.
	Object(Object &&other) noexcept : Ref<Fields>(static_cast<Ref<Fields> &&>(other)) {}
	Object &operator=(Object &&other) noexcept {
		Ref<Fields>::operator=(static_cast<Ref<Fields> &&>(other));
		return *this;
	}

	// A null handle (no storage). Unlike the default ctor it does not allocate,
	// so an absent optional object (`nullable<Object<T>>`) costs no heap block.
	static Object null() {
		return Object(Ref<Fields>());
	}

	// Field/identity access forward to the shared storage. `obj->a` and
	// `obj.get().a` are equivalent; codegen emits whichever reads more clearly
	// per context.
	using Ref<Fields>::operator->;
	using Ref<Fields>::operator*;
	using Ref<Fields>::get;
	using Ref<Fields>::pointer;
	using Ref<Fields>::refCount;
	using Ref<Fields>::hasValue;

	// Two objects are the same (identity) when their handles point at the same
	// storage — the TS `obj === other` notion, not a field comparison.
	bool isSame(const Object &other) const {
		return pointer() == other.pointer();
	}

private:
	// Adopts a base handle as-is (used by null(); never acquires beyond it).
	explicit Object(const Ref<Fields> &handle) : Ref<Fields>(handle) {}
};


} // namespace core_object

#endif
