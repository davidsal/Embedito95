// Candidate next-gen copy-on-write String backed by the core_mem::Ref refcount
// motor.
//
// NOT WIRED: nothing in the codegen references this yet. It is validated on the
// host by runtime-tests/string-ref.test.cpp before it supersedes
// string_common.h/.cpp (see todayPlan.md "Decisión: string como handle
// copy-on-write (CoW)"). It is deliberately self-contained (only <stdlib.h>,
// <stdint.h>, <string.h> plus the memory motor) so the host toolchain can
// compile it without the platform typedefs (u8/u16) or the flash macros. The
// swap step will move it into string_common.* and restore the numeric-assign
// helpers (which write through the same buffer path this validates) and the
// core_type/flash includes.
//
// Semantics (TS-like value semantics via copy-on-write, NOT shared-mutable):
//   - copy `let b = a` -> b aliases a's block (refs+1); NO text copy. O(1).
//   - first write to a shared string (`=`, `+=`, `<<`, push, pop, s[i] = c)
//     -> detach: deep-copy the text into a fresh refs=1 block and write there.
//     The other holders keep the original, so mutating never affects another
//     variable (observable immutability, as in TS).
//   - move -> steals the block; the moved-from String is empty.
//   - reassign `s = t` (handle binding) -> aliases t's block (local; like TS
//     immutable strings there is no content channel to the caller anyway).
//   - dtor -> release; the block is freed when the last handle dies.
//   - `s = "x"` / `s += "x"` replace/extend *content* (a write) -> detach if
//     shared, then mutate this string only.
//
// Flash backing is NOT part of this prototype: in the real runtime a flash
// literal is an input that the String constructors/append copy byte-wise into a
// refs=1 RAM block (the FlashString comparison path that reads flash directly
// never constructs a String). Two Strings made from the same literal are
// therefore independent RAM blocks and never share, so a write to one can never
// corrupt the other. That invariant is asserted by the host tests.

#ifndef _E95_STRING_REF_H
#define _E95_STRING_REF_H

#include "../memory/ref.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

namespace core_string {

using core_mem::Ref;

namespace detail {
// Capacity floor: fresh strings start here and shrinking never goes below it.
const uint16_t STRING_REF_MIN_CAPACITY = 5;
const uint16_t STRING_REF_GROWTH_DIVISOR = 4; // ~1.25x: cap + cap/div + 1
const uint16_t STRING_REF_U16_MAX = 65535;
} // namespace detail

// Refcounted, growable text block. The variable-length char array lives in a
// separately-allocated, realloc-managed buffer; a String is a Ref<Storage>, so
// copying a String shares this same Storage object (and thus its buffer). The
// deep-copy constructor is what lets a shared String diverge on its first write.
struct Storage {
	char *data;
	uint16_t size;
	uint16_t capacity;

#if defined(_E95_STRING_REF_TRACK)
	static int live;
#endif

	Storage() : data(nullptr), size(0), capacity(0) {
#if defined(_E95_STRING_REF_TRACK)
		live++;
#endif
		ensureCapacity(detail::STRING_REF_MIN_CAPACITY);
		if (data) {
			data[0] = '\0';
		}
	}

	// Deep copy of the text into an independent buffer (CoW divergence).
	Storage(const Storage &other) : data(nullptr), size(other.size), capacity(0) {
#if defined(_E95_STRING_REF_TRACK)
		live++;
#endif
		if (other.data) {
			uint16_t need = other.capacity ? other.capacity : (uint16_t)(other.size + 1);
			if (need < detail::STRING_REF_MIN_CAPACITY) {
				need = detail::STRING_REF_MIN_CAPACITY;
			}
			data = (char *)malloc(need);
			if (data) {
				capacity = need;
				memcpy(data, other.data, (size_t)other.size + 1);
			}
		}
	}

	Storage &operator=(const Storage &) = delete;

	~Storage() {
#if defined(_E95_STRING_REF_TRACK)
		live--;
#endif
		free(data);
	}

	// Grows geometrically (amortized). Returns false and leaves the buffer
	// intact on OOM (never truncates).
	bool ensureCapacity(uint16_t required) {
		if (capacity >= required) {
			return true;
		}
		uint16_t newCapacity = capacity + (uint16_t)(capacity / detail::STRING_REF_GROWTH_DIVISOR) + 1;
		if (newCapacity < capacity) {
			newCapacity = detail::STRING_REF_U16_MAX; // u16 saturation guard
		}
		if (newCapacity < detail::STRING_REF_MIN_CAPACITY) {
			newCapacity = detail::STRING_REF_MIN_CAPACITY;
		}
		if (newCapacity < required) {
			newCapacity = required;
		}
		void *newData = realloc(data, newCapacity);
		if (!newData) {
			return false;
		}
		data = (char *)newData;
		capacity = newCapacity;
		return true;
	}
};

class String {
public:
	String() : storage_(Ref<Storage>::emplace()) {}

	String(const char *value) : storage_(Ref<Storage>::emplace()) {
		if (storage_.hasValue()) {
			replaceText(value);
		}
	}

	// Copy shares the block (refs+1); the deep copy is deferred until a write.
	String(const String &other) = default;

	String(String &&other) noexcept : storage_(static_cast<Ref<Storage> &&>(other.storage_)) {}

	String &operator=(const String &other) {
		storage_ = other.storage_; // handle binding: alias other's block
		return *this;
	}

	String &operator=(String &&other) noexcept {
		storage_ = static_cast<Ref<Storage> &&>(other.storage_);
		return *this;
	}

	// A null handle (no storage). Unlike the default ctor it does not allocate,
	// so an absent optional string (`string | null`) costs no heap block.
	static String null() {
		return String(Ref<Storage>());
	}

	// `s = "text"` replaces CONTENT (a write): detach if shared, then copy.
	String &operator=(const char *value) {
		if (storage_.hasValue()) {
			ensureUnique();
			replaceText(value);
		}
		return *this;
	}

	~String() = default;

	void push(char value) {
		if (!storage_.hasValue()) {
			return;
		}
		ensureUnique();
		Storage &s = storage_.get();
		if (s.ensureCapacity((uint16_t)(s.size + 2))) {
			s.data[s.size] = value;
			s.size++;
			s.data[s.size] = '\0';
		}
	}

	void pop() {
		if (!storage_.hasValue()) {
			return;
		}
		ensureUnique();
		Storage &s = storage_.get();
		if (s.size == 0) {
			return;
		}
		s.size--;
		s.data[s.size] = '\0';
		if (s.size <= s.capacity / 2 && s.capacity > detail::STRING_REF_MIN_CAPACITY) {
			uint16_t newCapacity = s.capacity / 2;
			if (newCapacity < detail::STRING_REF_MIN_CAPACITY) {
				newCapacity = detail::STRING_REF_MIN_CAPACITY;
			}
			void *newData = realloc(s.data, newCapacity);
			if (newData) {
				s.data = (char *)newData;
				s.capacity = newCapacity;
			}
		}
	}

	// Mutating a character through operator[] is a write: detach first so the
	// change never reaches the other holders. (A bare read through a shared
	// string via the non-const operator[] therefore detaches too; use the const
	// operator[] / c_str() to read without copying.)
	char &operator[](uint16_t index) {
		ensureUnique();
		return storage_.get().data[index];
	}

	const char &operator[](uint16_t index) const {
		return storage_.get().data[index];
	}

	const char *c_str() const {
		return storage_.hasValue() && storage_.get().data ? storage_.get().data : "";
	}

	char *raw() {
		return storage_.hasValue() ? storage_.get().data : nullptr;
	}

	uint16_t length() const {
		return storage_.hasValue() ? storage_.get().size : 0;
	}

	bool operator==(const char *other) const {
		return compareText(other) == 0;
	}

	bool operator==(const String &other) const {
		return compareText(other.c_str()) == 0;
	}

	bool operator!=(const char *other) const {
		return compareText(other) != 0;
	}

	bool operator!=(const String &other) const {
		return compareText(other.c_str()) != 0;
	}

	String operator+(const char *other) const {
		String result(*this); // shares
		result += other;      // detaches on write, appends
		return result;
	}

	String operator+(const String &other) const {
		String result(*this);
		result += other;
		return result;
	}

	String &operator+=(const char *other) {
		if (!storage_.hasValue()) {
			return *this;
		}
		ensureUnique();
		appendText(other);
		return *this;
	}

	String &operator+=(const String &other) {
		if (!storage_.hasValue()) {
			return *this;
		}
		// Self-append doubles the text. ensureUnique (if it detaches) keeps the
		// same text, so doubling the (possibly new, unique) buffer is correct.
		// It must not go through appendTextLen: the source lives inside our own
		// buffer, which ensureCapacity may realloc out from under the copy.
		if (&other == this) {
			ensureUnique();
			Storage &s = storage_.get();
			uint16_t oldSize = s.size;
			if (oldSize == 0) {
				return *this;
			}
			if (!s.ensureCapacity((uint16_t)((uint16_t)(oldSize * 2) + 1))) {
				return *this;
			}
			memmove(s.data + oldSize, s.data, oldSize);
			s.size = (uint16_t)(oldSize * 2);
			s.data[s.size] = '\0';
			return *this;
		}
		ensureUnique();
		appendTextLen(other.c_str(), other.length());
		return *this;
	}

	String &operator<<(const char *other) {
		return *this += other;
	}

	String &operator<<(const String &other) {
		return *this += other;
	}

private:
	// Adopts a base handle as-is (used by null(); never acquires beyond it).
	explicit String(const Ref<Storage> &storage) : storage_(storage) {}

	void ensureUnique() {
		if (!storage_.hasValue()) {
			storage_ = Ref<Storage>::emplace();
			return;
		}
		if (storage_.refCount() > 1) {
			Ref<Storage> copy = Ref<Storage>::emplace(storage_.get());
			if (copy.hasValue()) {
				storage_ = copy; // drops our share of the old box (refCount--)
			}
		}
	}

	void replaceText(const char *bytes) {
		Storage &s = storage_.get();
		s.size = 0;
		if (s.data) {
			s.data[0] = '\0';
		}
		appendTextLen(bytes, textLength(bytes));
	}

	void appendText(const char *bytes) {
		appendTextLen(bytes, textLength(bytes));
	}

	void appendTextLen(const char *bytes, uint16_t addLength) {
		if (addLength == 0) {
			return;
		}
		Storage &s = storage_.get();
		if (s.ensureCapacity((uint16_t)(s.size + addLength + 1))) {
			memcpy(s.data + s.size, bytes, addLength);
			s.size += addLength;
			s.data[s.size] = '\0';
		}
	}

	int compareText(const char *other) const {
		const char *a = c_str();
		const char *b = other ? other : "";
		while (*a && *b && *a == *b) {
			a++;
			b++;
		}
		return *a - *b;
	}

	static uint16_t textLength(const char *bytes) {
		if (!bytes) {
			return 0;
		}
		uint16_t n = 0;
		while (bytes[n]) {
			n++;
		}
		return n;
	}

	Ref<Storage> storage_;
};

} // namespace core_string

#endif // _E95_STRING_REF_H
