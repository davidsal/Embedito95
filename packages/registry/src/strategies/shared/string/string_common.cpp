// Shared string implementation, platform-agnostic.
// Inlined into each platform's _e95_string.cpp via _e95_replace_common.
//
// Copy-on-write over core_mem::Ref<StrStorage>: copy shares the box; every
// write goes through ensureUnique() (detach on shared) so a mutation never
// affects another holder of the same string.
//
// Size justification (>350 lines): this file intentionally stays a single
// translation unit. It is not compiled on its own but textually inlined into
// every platform's generated string implementation, so splitting it would
// require a shared-include mechanism that no other strategy uses yet. The bulk
// comes from the methods themselves and their private ASCII helpers, not from
// duplicated logic: storage/copy-on-write constructors share `ensureUnique`
// and `ensureCapacity`, while read/search methods reuse `stringTextLength`,
// `stringLowerAscii` and `stringEqualsIgnoringCase`. Sections in order:
// ASCII helpers, copy-on-write storage, read accessors, search helpers,
// mutation.

static u16 stringTextLength(const char *bytes) {
	if (!bytes) {
		return 0;
	}
	u16 length = 0;
	while (bytes[length]) {
		length++;
	}
	return length;
}

static char stringLowerAscii(char value) {
	if (value >= 'A' && value <= 'Z') {
		return (char)(value - 'A' + 'a');
	}
	return value;
}

static char stringUpperAscii(char value) {
	if (value >= 'a' && value <= 'z') {
		return (char)(value - 'a' + 'A');
	}
	return value;
}

static bool stringIsAsciiWhitespace(char value) {
	return value == ' ' || value == '\t' || value == '\n' || value == '\r';
}

// ASCII-only case folding, as documented for matchesTextIgnoringCase: UTF-8
// code units outside A-Z/a-z are compared byte for byte.
static bool stringEqualsIgnoringCase(const char *left, const char *right, u16 length) {
	for (u16 index = 0; index < length; index++) {
		if (stringLowerAscii(left[index]) != stringLowerAscii(right[index])) {
			return false;
		}
	}
	return true;
}

namespace detail {
const i32 STRING_I32_MAX = 2147483647;
const u32 STRING_I32_MAX_MAGNITUDE = 2147483647u;
const u32 STRING_I32_MIN_MAGNITUDE = 2147483648u;
const i32 STRING_I32_MIN = -2147483647 - 1;
const i32 STRING_FLOAT_MAX_EXPONENT = 400;
const i32 STRING_FLOAT_EXPONENT_DIGIT_LIMIT = 10000;
} // namespace detail

static bool stringIsDigit(char value) {
	return value >= '0' && value <= '9';
}

static const char *stringSkipLeadingWhitespace(const char *text) {
	while (stringIsAsciiWhitespace(*text)) {
		text++;
	}
	return text;
}

// Accumulates decimal digits into `magnitude` without ever exceeding `limit`.
// On overflow it reports `saturated` and stops: the caller clamps to its bound.
static u32 stringParseMagnitude(const char *text, u32 limit, boolean *saturated) {
	u32 magnitude = 0;
	*saturated = false;
	while (stringIsDigit(*text)) {
		const u32 digit = (u32)(*text - '0');
		if (magnitude > (limit - digit) / 10) {
			*saturated = true;
			return magnitude;
		}
		magnitude = magnitude * 10 + digit;
		text++;
	}
	return magnitude;
}

const f64 STRING_FLOAT_ZERO = (f64)0;
const f64 STRING_FLOAT_ONE = (f64)1;
const f64 STRING_FLOAT_FIVE = (f64)5;
const f64 STRING_FLOAT_TEN = (f64)10;

static f64 stringScaleByPowerOfTen(f64 value, i32 exponent) {
	i32 remaining = exponent;
	if (remaining > detail::STRING_FLOAT_MAX_EXPONENT) {
		remaining = detail::STRING_FLOAT_MAX_EXPONENT;
	}
	if (remaining < -detail::STRING_FLOAT_MAX_EXPONENT) {
		remaining = -detail::STRING_FLOAT_MAX_EXPONENT;
	}
	while (remaining > 0) {
		value *= STRING_FLOAT_TEN;
		remaining--;
	}
	while (remaining < 0) {
		value /= STRING_FLOAT_TEN;
		remaining++;
	}
	return value;
}

// Scans the optional exponent after 'e'/'E'. A missing digit leaves the
// exponent untouched, matching the "stop at the first non-number character"
// rule (e.g. "1.5e" parses as 1.5).
static const char *stringParseExponent(const char *text, i32 *exponent) {
	const char *cursor = text;
	boolean negative = false;
	if (*cursor == '+' || *cursor == '-') {
		negative = (*cursor == '-');
		cursor++;
	}
	if (!stringIsDigit(*cursor)) {
		return text;
	}
	i32 value = 0;
	while (stringIsDigit(*cursor)) {
		if (value < detail::STRING_FLOAT_EXPONENT_DIGIT_LIMIT) {
			value = value * 10 + (i32)(*cursor - '0');
			if (value > detail::STRING_FLOAT_EXPONENT_DIGIT_LIMIT) {
				value = detail::STRING_FLOAT_EXPONENT_DIGIT_LIMIT;
			}
		}
		cursor++;
	}
	*exponent = negative ? -value : value;
	return cursor;
}

StrStorage::StrStorage() : data(nullptr), size(0), capacity(0) {
	ensureCapacity(detail::STRING_MIN_CAPACITY);
	if (data) {
		data[0] = '\0';
	}
}

StrStorage::StrStorage(const StrStorage &other) : data(nullptr), size(other.size), capacity(0) {
	if (other.data) {
		u16 need = other.capacity ? other.capacity : (u16)(other.size + 1);
		if (need < detail::STRING_MIN_CAPACITY) {
			need = detail::STRING_MIN_CAPACITY;
		}
		data = (char *)malloc(need);
		if (data) {
			capacity = need;
			memcpy(data, other.data, (size_t)other.size + 1);
		}
	}
}

StrStorage::~StrStorage() {
	free(data);
}

bool StrStorage::ensureCapacity(u16 required) {
	if (capacity >= required) {
		return true;
	}
	u16 newCapacity = capacity + (u16)(capacity / detail::STRING_GROWTH_DIVISOR) + 1;
	if (newCapacity < capacity) {
		newCapacity = detail::STRING_U16_MAX; // u16 saturation guard
	}
	if (newCapacity < detail::STRING_MIN_CAPACITY) {
		newCapacity = detail::STRING_MIN_CAPACITY;
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

String::String() : storage_(Ref<StrStorage>::emplace()) {}

String::String(const Ref<StrStorage> &storage) : storage_(storage) {}

String String::null() {
	return String(Ref<StrStorage>());
}

String::String(const char *value) : storage_(Ref<StrStorage>::emplace()) {
	assign(value);
}

String::String(const String &other) : storage_(other.storage_) {}

String::String(String &&other) : storage_(static_cast<Ref<StrStorage> &&>(other.storage_)) {}

String::String(i8 value) : storage_(Ref<StrStorage>::emplace()) {
	assignSigned32(value);
}

String::String(u8 value) : storage_(Ref<StrStorage>::emplace()) {
	assignUnsigned32(value);
}

String::String(i16 value) : storage_(Ref<StrStorage>::emplace()) {
	assignSigned32(value);
}

String::String(u16 value) : storage_(Ref<StrStorage>::emplace()) {
	assignUnsigned32(value);
}

String::String(i32 value) : storage_(Ref<StrStorage>::emplace()) {
	assignSigned32(value);
}

String::String(u32 value) : storage_(Ref<StrStorage>::emplace()) {
	assignUnsigned32(value);
}

String::String(i64 value) : storage_(Ref<StrStorage>::emplace()) {
	assignSigned64(value);
}

String::String(u64 value) : storage_(Ref<StrStorage>::emplace()) {
	assignUnsigned64(value);
}

String::String(boolean value) : storage_(Ref<StrStorage>::emplace()) {
	assign(value ? "true" : "false");
}

String::String(f32 value) : storage_(Ref<StrStorage>::emplace()) {
	assignFloat((f64)value, 7);
}

String::String(f64 value) : storage_(Ref<StrStorage>::emplace()) {
	assignFloat(value, 15);
}

String &String::operator=(const char *value) {
	if (storage_.hasValue()) {
		assign(value);
	}
	return *this;
}

String &String::operator=(const String &other) {
	storage_ = other.storage_;
	return *this;
}

String &String::operator=(String &&other) {
	storage_ = static_cast<Ref<StrStorage> &&>(other.storage_);
	return *this;
}

String::~String() {}

void String::push(char value) {
	if (!storage_.hasValue()) {
		return;
	}
	ensureUnique();
	StrStorage &s = storage_.get();
	if (s.ensureCapacity((u16)(s.size + 2))) {
		s.data[s.size] = value;
		s.size++;
		s.data[s.size] = '\0';
	}
}

void String::pop() {
	if (!storage_.hasValue()) {
		return;
	}
	ensureUnique();
	StrStorage &s = storage_.get();
	if (s.size == 0) {
		return;
	}
	s.size--;
	s.data[s.size] = '\0';
	if (s.size <= s.capacity / 2 && s.capacity > detail::STRING_MIN_CAPACITY) {
		u16 newCapacity = s.capacity / 2;
		if (newCapacity < detail::STRING_MIN_CAPACITY) {
			newCapacity = detail::STRING_MIN_CAPACITY;
		}
		void *newData = realloc(s.data, newCapacity);
		if (newData) {
			s.data = (char *)newData;
			s.capacity = newCapacity;
		}
	}
}

char &String::operator[](u16 index) {
	ensureUnique();
	return storage_.get().data[index];
}

char String::getCharacter(u16 index) const {
	if (!storage_.hasValue()) {
		return '\0';
	}
	const StrStorage &storage = storage_.get();
	if (index >= storage.size) {
		return '\0';
	}
	return storage.data[index];
}

// Clamped, half-open slice: start/end beyond the text collapse to its bounds
// and an inverted or empty range yields an empty string.
String String::getSlice(u16 start, u16 end) const {
	String result;
	if (!storage_.hasValue()) {
		return result;
	}
	const StrStorage &storage = storage_.get();
	const u16 safeStart = start > storage.size ? storage.size : start;
	const u16 safeEnd = end > storage.size ? storage.size : end;
	if (safeStart >= safeEnd) {
		return result;
	}
	result.appendText(storage.data + safeStart, (u16)(safeEnd - safeStart));
	return result;
}

i16 String::findTextFrom(const String &needle, u16 from) const {
	const u16 haystackLength = length();
	if (from > haystackLength) {
		return -1;
	}
	const u16 needleLength = needle.length();
	if (needleLength == 0) {
		return (i16)from;
	}
	if (needleLength > haystackLength - from) {
		return -1;
	}
	const char *haystack = c_str();
	const char *needleText = needle.c_str();
	for (u16 index = from; (u32)index + needleLength <= haystackLength; index++) {
		if (memcmp(haystack + index, needleText, needleLength) == 0) {
			return (i16)index;
		}
	}
	return -1;
}

i16 String::findLastTextFrom(const String &needle, u16 from) const {
	const u16 haystackLength = length();
	if (from > haystackLength) {
		return -1;
	}
	const u16 needleLength = needle.length();
	if (needleLength == 0) {
		return (i16)from;
	}
	if (needleLength > haystackLength) {
		return -1;
	}
	const u16 lastStart = (u16)(haystackLength - needleLength);
	const u16 start = from < lastStart ? from : lastStart;
	const char *haystack = c_str();
	const char *needleText = needle.c_str();
	for (u16 index = (u16)(start + 1); index > 0; index--) {
		if (memcmp(haystack + (index - 1), needleText, needleLength) == 0) {
			return (i16)(index - 1);
		}
	}
	return -1;
}

bool String::hasPrefix(const String &prefix) const {
	const u16 prefixLength = prefix.length();
	if (prefixLength > length()) {
		return false;
	}
	return memcmp(c_str(), prefix.c_str(), prefixLength) == 0;
}

bool String::hasSuffix(const String &suffix) const {
	const u16 suffixLength = suffix.length();
	const u16 textLength = length();
	if (suffixLength > textLength) {
		return false;
	}
	return memcmp(c_str() + (textLength - suffixLength), suffix.c_str(), suffixLength) == 0;
}

bool String::matchesText(const String &other) const {
	return *this == other;
}

bool String::matchesTextIgnoringCase(const String &other) const {
	const u16 textLength = length();
	if (textLength != other.length()) {
		return false;
	}
	return stringEqualsIgnoringCase(c_str(), other.c_str(), textLength);
}

i32 String::parseInteger() const {
	const char *cursor = stringSkipLeadingWhitespace(c_str());
	boolean negative = false;
	if (*cursor == '+' || *cursor == '-') {
		negative = (*cursor == '-');
		cursor++;
	}
	if (!stringIsDigit(*cursor)) {
		return 0;
	}
	const u32 limit = negative ? detail::STRING_I32_MIN_MAGNITUDE
	                           : detail::STRING_I32_MAX_MAGNITUDE;
	boolean saturated = false;
	const u32 magnitude = stringParseMagnitude(cursor, limit, &saturated);
	if (saturated) {
		return negative ? detail::STRING_I32_MIN : detail::STRING_I32_MAX;
	}
	if (negative) {
		return magnitude == detail::STRING_I32_MIN_MAGNITUDE
		           ? detail::STRING_I32_MIN
		           : -(i32)magnitude;
	}
	return (i32)magnitude;
}

f32 String::parseFloat32() const {
	return (f32)parseFloat64();
}

f64 String::parseFloat64() const {
	const char *cursor = stringSkipLeadingWhitespace(c_str());
	boolean negative = false;
	if (*cursor == '+' || *cursor == '-') {
		negative = (*cursor == '-');
		cursor++;
	}
	boolean hasDigits = false;
	f64 value = STRING_FLOAT_ZERO;
	i32 fractionalDigits = 0;
	while (stringIsDigit(*cursor)) {
		value = value * STRING_FLOAT_TEN + (f64)(*cursor - '0');
		hasDigits = true;
		cursor++;
	}
	if (*cursor == '.') {
		cursor++;
		while (stringIsDigit(*cursor)) {
			value = value * STRING_FLOAT_TEN + (f64)(*cursor - '0');
			hasDigits = true;
			fractionalDigits++;
			cursor++;
		}
	}
	if (!hasDigits) {
		return STRING_FLOAT_ZERO;
	}
	i32 exponent = 0;
	if (*cursor == 'e' || *cursor == 'E') {
		cursor = stringParseExponent(cursor + 1, &exponent);
	}
	const f64 magnitude = stringScaleByPowerOfTen(value, exponent - fractionalDigits);
	return negative ? -magnitude : magnitude;
}

core_array::Array<u8> String::toByteArray() const {
	core_array::Array<u8> bytes;
	const u16 textLength = length();
	bytes.reserve(textLength);
	const char *text = c_str();
	for (u16 index = 0; index < textLength; index++) {
		bytes.push((u8)(text[index]));
	}
	return bytes;
}

core_array::Array<char> String::toCharacterArray() const {
	core_array::Array<char> characters;
	const u16 textLength = length();
	characters.reserve((u16)(textLength + 1));
	const char *text = c_str();
	for (u16 index = 0; index < textLength; index++) {
		characters.push(text[index]);
	}
	characters.push('\0');
	return characters;
}

void String::reserveCapacity(u16 minimumCapacity) {
	if (!storage_.hasValue()) {
		storage_ = Ref<StrStorage>::emplace();
	}
	StrStorage &storage = storage_.get();
	const u16 textFloor = (u16)(storage.size + 1);
	storage.ensureCapacity(minimumCapacity > textFloor ? minimumCapacity : textFloor);
}

bool String::operator==(const char *other) const {
	const char *left = c_str();
	const char *right = other ? other : "";
	while (*left && *right && *left == *right) {
		left++;
		right++;
	}
	return *left == *right;
}

bool String::operator==(const String &other) const {
	return *this == other.c_str();
}

bool String::operator!=(const char *other) const {
	return !(*this == other);
}

bool String::operator!=(const String &other) const {
	return !(*this == other);
}

String String::operator+(const char *other) const {
	String result(*this);
	result += other;
	return result;
}

String String::operator+(const String &other) const {
	String result(*this);
	result += other;
	return result;
}

String &String::operator+=(const char *other) {
	if (!storage_.hasValue()) {
		return *this;
	}
	ensureUnique();
	appendText(other ? other : "", stringTextLength(other));
	return *this;
}

String &String::operator+=(const String &other) {
	if (!storage_.hasValue()) {
		return *this;
	}
	// Self-append doubles the text. ensureUnique (if it detaches) keeps the
	// same text, so doubling the (possibly new, unique) buffer is correct.
	// It must not go through appendText: the source lives inside our own
	// buffer, which ensureCapacity may realloc out from under the copy.
	if (&other == this) {
		ensureUnique();
		StrStorage &s = storage_.get();
		u16 oldSize = s.size;
		if (oldSize == 0) {
			return *this;
		}
		if (!s.ensureCapacity((u16)((u16)(oldSize * 2) + 1))) {
			return *this;
		}
		memmove(s.data + oldSize, s.data, oldSize);
		s.size = (u16)(oldSize * 2);
		s.data[s.size] = '\0';
		return *this;
	}
	ensureUnique();
	appendText(other.c_str(), other.length());
	return *this;
}

String &String::operator<<(const char *other) {
	return *this += other;
}

String &String::operator<<(const String &other) {
	return *this += other;
}

void String::setCharacter(u16 index, char value) {
	if (!storage_.hasValue()) {
		return;
	}
	if (index >= storage_.get().size) {
		return;
	}
	ensureUnique();
	storage_.get().data[index] = value;
}

void String::appendText(const String &other) {
	*this += other;
}

bool String::replaceText(const String &search, const String &replacement) {
	if (!storage_.hasValue()) {
		return false;
	}
	const u16 searchLength = search.length();
	if (searchLength == 0) {
		return false;
	}
	const u16 haystackLength = length();
	if (searchLength > haystackLength) {
		return false;
	}
	const char *haystack = c_str();
	const char *needle = search.c_str();
	const u16 replacementLength = replacement.length();
	const char *replacementText = replacement.c_str();

	u16 matchCount = 0;
	u16 scanIndex = 0;
	while ((u32)scanIndex + searchLength <= haystackLength) {
		if (memcmp(haystack + scanIndex, needle, searchLength) == 0) {
			matchCount++;
			scanIndex = (u16)(scanIndex + searchLength);
		} else {
			scanIndex++;
		}
	}
	if (matchCount == 0) {
		return false;
	}

	const u32 newLength = (u32)haystackLength +
		(u32)matchCount * replacementLength - (u32)matchCount * searchLength;
	if (newLength >= detail::STRING_U16_MAX) {
		return false;
	}

	// Build into a fresh box: `needle`/`replacementText` may point inside this
	// handle's own buffer, so the source text must stay untouched until the
	// result is complete.
	String result;
	if (!result.storage_.hasValue()) {
		return false;
	}
	StrStorage &resultStorage = result.storage_.get();
	if (!resultStorage.ensureCapacity((u16)(newLength + 1))) {
		return false;
	}
	u16 readIndex = 0;
	u16 writeIndex = 0;
	while (readIndex < haystackLength) {
		if (
			(u32)readIndex + searchLength <= haystackLength &&
			memcmp(haystack + readIndex, needle, searchLength) == 0
		) {
			if (replacementLength > 0) {
				memcpy(
					resultStorage.data + writeIndex,
					replacementText,
					replacementLength);
			}
			writeIndex = (u16)(writeIndex + replacementLength);
			readIndex = (u16)(readIndex + searchLength);
		} else {
			resultStorage.data[writeIndex] = haystack[readIndex];
			writeIndex++;
			readIndex++;
		}
	}
	resultStorage.data[writeIndex] = '\0';
	resultStorage.size = writeIndex;
	storage_ = result.storage_;
	return true;
}

void String::removeRange(u16 start, u16 end) {
	if (!storage_.hasValue()) {
		return;
	}
	StrStorage &storage = storage_.get();
	if (start >= storage.size) {
		return;
	}
	const u16 safeEnd = end > storage.size ? storage.size : end;
	if (safeEnd <= start) {
		return;
	}
	ensureUnique();
	StrStorage &trimmed = storage_.get();
	const u16 tailLength = (u16)(trimmed.size - safeEnd);
	if (tailLength > 0) {
		memmove(trimmed.data + start, trimmed.data + safeEnd, tailLength);
	}
	trimmed.size = (u16)(start + tailLength);
	trimmed.data[trimmed.size] = '\0';
}

void String::trimWhitespace() {
	if (!storage_.hasValue()) {
		return;
	}
	const StrStorage &storage = storage_.get();
	u16 start = 0;
	u16 end = storage.size;
	while (start < end && stringIsAsciiWhitespace(storage.data[start])) {
		start++;
	}
	while (end > start && stringIsAsciiWhitespace(storage.data[end - 1])) {
		end--;
	}
	if (start == 0 && end == storage.size) {
		return;
	}
	ensureUnique();
	StrStorage &trimmed = storage_.get();
	const u16 newSize = (u16)(end - start);
	if (newSize > 0) {
		memmove(trimmed.data, trimmed.data + start, newSize);
	}
	trimmed.size = newSize;
	trimmed.data[newSize] = '\0';
}

void String::toUpperCase() {
	if (!storage_.hasValue()) {
		return;
	}
	ensureUnique();
	StrStorage &storage = storage_.get();
	for (u16 index = 0; index < storage.size; index++) {
		storage.data[index] = stringUpperAscii(storage.data[index]);
	}
}

void String::toLowerCase() {
	if (!storage_.hasValue()) {
		return;
	}
	ensureUnique();
	StrStorage &storage = storage_.get();
	for (u16 index = 0; index < storage.size; index++) {
		storage.data[index] = stringLowerAscii(storage.data[index]);
	}
}

void String::ensureUnique() {
	if (!storage_.hasValue()) {
		storage_ = Ref<StrStorage>::emplace();
		return;
	}
	if (storage_.refCount() > 1) {
		Ref<StrStorage> copy = Ref<StrStorage>::emplace(storage_.get());
		if (copy.hasValue()) {
			storage_ = copy; // drops this handle's share of the old box
		}
	}
}

void String::assign(const char *value) {
	if (!storage_.hasValue()) {
		return;
	}
	ensureUnique();
	const char *start = value ? value : "";
	u16 length = stringTextLength(start);
	StrStorage &s = storage_.get();
	if (!s.ensureCapacity((u16)(length + 1))) {
		return;
	}
	s.size = 0;
	if (length > 0) {
		memcpy(s.data, start, length);
	}
	s.data[length] = '\0';
	s.size = length;
}

void String::appendText(const char *bytes, u16 addLength) {
	if (addLength == 0) {
		return;
	}
	StrStorage &s = storage_.get();
	if (s.ensureCapacity((u16)(s.size + addLength + 1))) {
		memcpy(s.data + s.size, bytes, addLength);
		s.size = (u16)(s.size + addLength);
		s.data[s.size] = '\0';
	}
}

bool FlashString::operator==(const char *other) const {
	const char *right = (const char *)handle;
	const char *left = other ? other : "";
	while (*left && _E95_READ_FLASH_BYTE(right)) {
		if (*left != (char)_E95_READ_FLASH_BYTE(right)) {
			return false;
		}
		left++;
		right++;
	}
	return *left == (char)_E95_READ_FLASH_BYTE(right);
}

_e95_replace_numberFormat
