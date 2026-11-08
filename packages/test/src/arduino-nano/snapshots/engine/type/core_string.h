#ifndef _E95_STRING_H
#define _E95_STRING_H

#include <Arduino.h>
#include <stdlib.h>
#include <string.h>
#include <core_type.h>
#include <core_memory.h>

#define _E95_INT32_MAX_DIGITS 11
#define _E95_INT32_MAX_CHARS 12

#define _E95_FLASH_STRING_TYPE const __FlashStringHelper *
#define _E95_READ_FLASH_BYTE(ptr) pgm_read_byte(ptr)
#define _E95_FLASH_STRING_DISTINCT 1

struct u128;
struct i128;

// Forward declaration: `core_type.h` includes `core_array.h` and
// `core_string.h` in that order, so a full include here would close an include
// cycle before the `core_array` namespace exists. Declarations only need the
// incomplete template; the implementation includes the real definition.
namespace core_array {
template <typename T>
class Array;
}

namespace core_string {

// Shared string declarations, platform-agnostic.
// Inlined into each platform's _e95_string.h via _e95_replace_common.
//
// String is a copy-on-write handle: a core_mem::Ref to a shared StrStorage box.
// Copying a String shares the box (refs+1, no text copy); the first write to a
// shared String detaches a deep copy, so mutating a string never affects
// another variable (TS value semantics). The model is validated on the host by
// runtime-tests/string-ref.test.cpp against the self-contained mirror in
// string_ref.h (same semantics, host typedefs). Flash literals are inputs that
// are always copied into a refs=1 RAM box, so two Strings built from the same
// literal never share.

using core_mem::Ref;

namespace detail {
// Capacity floor: fresh strings start here and shrinking never goes below it.
const u16 STRING_MIN_CAPACITY = 5;
const u16 STRING_GROWTH_DIVISOR = 4; // capacity + cap/divisor + 1 (set per platform, same factor as Array)
const u16 STRING_U16_MAX = 65535;
} // namespace detail

// Refcounted, growable text block shared by all handles to the same string.
// Methods are defined in string_common.cpp. The deep-copy constructor is what
// lets a shared String diverge on its first write.
struct StrStorage {
	char *data;
	u16 size;
	u16 capacity;

	StrStorage();
	StrStorage(const StrStorage &other);
	StrStorage &operator=(const StrStorage &) = delete;
	~StrStorage();

	bool ensureCapacity(u16 required);
};

class String {
public:
	String();
	// A null handle (no storage). Unlike the default ctor it does not allocate,
	// so an absent optional string (`string | null`) costs no heap block.
	static String null();
	String(const char *value);
	String(const String &other);
	String(String &&other);
#if defined(_E95_FLASH_STRING_DISTINCT)
	String(_E95_FLASH_STRING_TYPE value);
#endif
	String(i8 value);
	String(u8 value);
	String(i16 value);
	String(u16 value);
	String(i32 value);
	String(u32 value);
	String(i64 value);
	String(u64 value);
	String(boolean value);
	String(f32 value);
	String(f64 value);
	String(u128 value);
	String(i128 value);
	template<typename T>
	String(const nullable<T>& value)
		: String(value.isNull ? String("null") : String(value.value)) {}
	String &operator=(const char *value);
	String &operator=(const String &other);
	String &operator=(String &&other);
	~String();
	void push(char value);
	void pop();

	// Mutating a character is a write: detach first so the change never reaches
	// the other holders. Defined in string_common.cpp.
	char &operator[](u16 index);

	// Mutators. Every one detaches a shared handle before writing, so a copy
	// diverges from the original only after it is mutated.
	//
	// Writes `value` at `index` when that position is inside the text; an
	// out-of-range index is a no-op.
	void setCharacter(u16 index, char value);
	// Appends `other` to the end, exactly like `+=` and keeping the same handle.
	void appendText(const String &other);
	// Replaces every non-overlapping occurrence of `search` with `replacement`
	// and reports whether at least one occurrence was replaced. An empty
	// `search` is rejected with false. The replacement may be empty, longer or
	// shorter than the search text.
	bool replaceText(const String &search, const String &replacement);
	// Removes the half-open range [start, end), clamped to the text bounds.
	// An empty, inverted or fully out-of-range span is a no-op.
	void removeRange(u16 start, u16 end);
	// Removes spaces, tabs, newlines and carriage returns from both ends.
	void trimWhitespace();
	// ASCII case folding in place; digits, symbols and non-ASCII bytes are
	// left untouched.
	void toUpperCase();
	void toLowerCase();

	const char &operator[](u16 index) const {
		return storage_.get().data[index];
	}

	// The text is always NUL-terminated, so the internal handle exposes this
	// C-string view for generated code; it is not part of the e95-visible
	// method surface.
	const char *c_str() const {
		return storage_.hasValue() && storage_.get().data ? storage_.get().data : "";
	}

	u16 length() const {
		return storage_.hasValue() ? storage_.get().size : 0;
	}

	// Read-only accessors. Being const, they never touch the shared control
	// block beyond reading it, so they do not detach a shared COW handle.
	char getCharacter(u16 index) const;
	String getSlice(u16 start, u16 end) const;
	i16 findTextFrom(const String &needle, u16 from) const;
	i16 findLastTextFrom(const String &needle, u16 from) const;
	bool hasPrefix(const String &prefix) const;
	bool hasSuffix(const String &suffix) const;
	bool matchesText(const String &other) const;
	bool matchesTextIgnoringCase(const String &other) const;

	// Numeric conversion. Hand-written, locale-independent parsers that scan
	// the text deterministically on every platform: skip leading spaces/tabs/
	// newlines/carriage returns, accept an optional '+'/'-', stop at the first
	// character that does not belong to the number and return zero when no
	// number is found. `parseInteger` saturates at the i32 bounds on overflow.
	i32 parseInteger() const;
	f32 parseFloat32() const;
	f64 parseFloat64() const;

	// Copies the text into a new buffer. `toByteArray` has exactly one element
	// per character and no terminator; `toCharacterArray` appends a trailing
	// '\0', so its length is `length() + 1`.
	core_array::Array<u8> toByteArray() const;
	core_array::Array<char> toCharacterArray() const;

	// Grow-only capacity hint. Raises the backing capacity to at least
	// `minimumCapacity` and never drops it below the current text length. The
	// text itself is unchanged.
	void reserveCapacity(u16 minimumCapacity);

	bool operator==(const char *other) const;
	bool operator==(const String &other) const;
#if defined(_E95_FLASH_STRING_DISTINCT)
	bool operator==(_E95_FLASH_STRING_TYPE other) const;
#endif
	bool operator!=(const char *other) const;
	bool operator!=(const String &other) const;
#if defined(_E95_FLASH_STRING_DISTINCT)
	bool operator!=(_E95_FLASH_STRING_TYPE other) const;
#endif
	String operator+(const char *other) const;
	String operator+(const String &other) const;
#if defined(_E95_FLASH_STRING_DISTINCT)
	String operator+(_E95_FLASH_STRING_TYPE other) const;
#endif
	String &operator+=(const char *other);
	String &operator+=(const String &other);
#if defined(_E95_FLASH_STRING_DISTINCT)
	String &operator+=(_E95_FLASH_STRING_TYPE other);
#endif
	String &operator<<(const char *other);
	String &operator<<(const String &other);
#if defined(_E95_FLASH_STRING_DISTINCT)
	String &operator<<(_E95_FLASH_STRING_TYPE other);
#endif

private:
	// Adopts a base handle as-is (used by null(); never acquires beyond it).
	explicit String(const Ref<StrStorage> &storage);

	Ref<StrStorage> storage_;

	// Makes this handle own the text exclusively (refs == 1): a no-op when it
	// already does; otherwise deep-copies into a fresh refs=1 box. Call before
	// any write. On OOM the handle keeps sharing the current box (write is a
	// no-op), never truncating.
	void ensureUnique();
	void assign(const char *value);
	void appendText(const char *bytes, u16 addLength);
	void assignSigned32(i32 value);
	void assignUnsigned32(u32 value);
	void assignSigned64(i64 value);
	void assignUnsigned64(u64 value);
	void assignFloat(f64 value, u16 maxDigits);
	void assignU128(u64 lo, u64 hi, boolean negative);
};

class FlashString {
public:
	_E95_FLASH_STRING_TYPE handle;

	operator _E95_FLASH_STRING_TYPE() const {
		return handle;
	}

	bool operator==(const char *other) const;

	bool operator==(const String &other) const {
		return other == handle;
	}

	bool operator!=(const char *other) const {
		return !(*this == other);
	}

	bool operator!=(const String &other) const {
		return !(*this == other);
	}

	String operator+(const char *other) const {
		return String(handle) + other;
	}

	String operator+(const String &other) const {
		return String(handle) + other;
	}
};


} // namespace core_string

#define _E95_FLASH_STRING(name, literal) \
	static const char _e95_##name##_data[] PROGMEM = literal; \
	const core_string::FlashString name = { reinterpret_cast<const __FlashStringHelper *>(_e95_##name##_data) }

#endif
