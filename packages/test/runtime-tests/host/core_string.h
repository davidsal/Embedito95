#ifndef _E95_RUNTIME_HOST_CORE_STRING_H
#define _E95_RUNTIME_HOST_CORE_STRING_H
// Host stand-in for `core_string.h`, wide enough for the runtime tests that
// compile generated libraries: the `nullable` helper plus a small `String` with
// the numeric/char-pointer constructors, `push`, `length`, `operator[]` and
// `c_str`. The fixed buffer keeps the host model independent of the real
// refcounted allocator while preserving the observable string behaviour.
#include <stddef.h>
#include <stdint.h>
#include <string.h>

template <typename T>
struct nullable {
	bool isNull;
	T value;
};

namespace core_string {

const uint16_t HOST_STRING_CAPACITY = 256;

class String {
public:
	String() {
		clear();
	}

	String(const char *text) {
		clear();
		appendText(text);
	}

	String(int8_t) { clear(); }
	String(uint8_t) { clear(); }
	String(int16_t) { clear(); }
	String(uint16_t) { clear(); }
	String(int32_t) { clear(); }
	String(uint32_t) { clear(); }
	String(int64_t) { clear(); }
	String(uint64_t) { clear(); }
	String(float) { clear(); }
	String(double) { clear(); }

	void push(char value) {
		if (size + 1 < HOST_STRING_CAPACITY) {
			buffer[size] = value;
			size++;
			buffer[size] = '\0';
		}
	}

	char &operator[](uint16_t index) {
		return buffer[index];
	}

	const char &operator[](uint16_t index) const {
		return buffer[index];
	}

	uint16_t length() const {
		return size;
	}

	const char *c_str() const {
		return buffer;
	}

private:
	char buffer[HOST_STRING_CAPACITY];
	uint16_t size;

	void clear() {
		size = 0;
		buffer[0] = '\0';
	}

	void appendText(const char *text) {
		if (text == nullptr) {
			return;
		}
		const size_t length = strlen(text);
		for (size_t index = 0; index < length && size + 1 < HOST_STRING_CAPACITY; index++) {
			buffer[size] = text[index];
			size++;
		}
		buffer[size] = '\0';
	}
};

} // namespace core_string

#endif
