#include <stdlib.h>
#include <avr/pgmspace.h>
#include "core_string.h"

namespace core_string {

// Flash literals are inputs: the resulting String owns a fresh refs=1 RAM box
// (never shares the flash bytes), so later writes to it can never corrupt the
// literal or any other String made from it.

String::String(const __FlashStringHelper *value) : storage_(Ref<StrStorage>::emplace()) {
	if (!storage_.hasValue()) {
		return;
	}
	const char *text = (const char *)value;
	u16 length = 0;
	while (pgm_read_byte(text + length)) {
		length++;
	}
	StrStorage &s = storage_.get();
	if (s.ensureCapacity((u16)(length + 1))) {
		for (u16 i = 0; i < length; i++) {
			s.data[i] = (char)pgm_read_byte(text + i);
		}
		s.data[length] = '\0';
		s.size = length;
	}
}

bool String::operator==(const __FlashStringHelper *other) const {
	const char *left = c_str();
	const char *flashRight = (const char *)other;
	while (*left && pgm_read_byte(flashRight)) {
		if (*left != (char)pgm_read_byte(flashRight)) {
			return false;
		}
		left++;
		flashRight++;
	}
	return *left == (char)pgm_read_byte(flashRight);
}

bool String::operator!=(const __FlashStringHelper *other) const {
	return !(*this == other);
}

String String::operator+(const __FlashStringHelper *other) const {
	String result(*this);
	result += other;
	return result;
}

String &String::operator+=(const __FlashStringHelper *other) {
	if (!storage_.hasValue()) {
		return *this;
	}
	ensureUnique(); // detach if shared before appending into our own buffer
	const char *flashOther = (const char *)other;
	u16 addLength = 0;
	while (pgm_read_byte(flashOther + addLength)) {
		addLength++;
	}
	StrStorage &s = storage_.get();
	if (s.ensureCapacity((u16)(s.size + addLength + 1))) {
		for (u16 i = 0; i < addLength; i++) {
			s.data[s.size + i] = (char)pgm_read_byte(flashOther + i);
		}
		s.size += addLength;
		s.data[s.size] = '\0';
	}
	return *this;
}

String &String::operator<<(const __FlashStringHelper *other) {
	return *this += other;
}

_e95_replace_common

} // namespace core_string
