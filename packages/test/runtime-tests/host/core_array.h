#ifndef _E95_RUNTIME_HOST_CORE_ARRAY_H
#define _E95_RUNTIME_HOST_CORE_ARRAY_H
// Host stand-in for the platform `core_array.h`. The arduino SPI header passes
// `core_array::Array<u8>` by reference, so the host only needs the slice of the
// real interface the SPI surface uses: `length`, `push` and `operator[]` with
// the same signatures. Copies are deep here (std::vector) instead of the real
// shared-mutable Ref storage, but the SPI surface never relies on aliasing, so
// the difference is not exercised.
#include <Arduino.h>
#include <stdint.h>
#include <vector>

namespace core_array {

template <typename T>
class Array {
public:
	Array() {}

	u16 length() const {
		return (u16)values_.size();
	}

	void push(T value) {
		values_.push_back(value);
	}

	const T &operator[](u16 index) const {
		return values_[index];
	}

	T &operator[](u16 index) {
		return values_[index];
	}

private:
	std::vector<T> values_;
};

} // namespace core_array

#endif
