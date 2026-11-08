#ifndef _E95_RUNTIME_HOST_CORE_CANVAS_H
#define _E95_RUNTIME_HOST_CORE_CANVAS_H
// Host stand-in for the generated `core_canvas.h`. The ssd1306 driver only
// reads glyph columns, so a deterministic character/column function is enough
// to exercise text writes and their chunking on the host.
#include <Arduino.h>

namespace core_canvas {

inline u8 getGlyphColumn(char character, u8 column) {
	return (u8)((u8)character + column);
}

} // namespace core_canvas

#endif
