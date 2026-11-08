#include "core_math.h"

namespace core_math {

_e95_replace_common

i32 randomInteger(i32 minimum, i32 maximum) {
	if (maximum <= minimum) {
		return minimum;
	}
	return minimum + (i32)::random((long)(maximum - minimum));
}

void seedRandom(u32 seed) {
	::randomSeed((unsigned long)seed);
}

} // namespace core_math
