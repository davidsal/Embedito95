#ifndef _E95_CANVAS_H
#define _E95_CANVAS_H

#include "../type/core_type.h"

namespace core_canvas {

#define _E95_GLYPH_WIDTH 5
#define _E95_FONT_FIRST_CHAR 0x20
#define _E95_FONT_LAST_CHAR 0x7E

u8 getGlyphColumn(char character, u8 columnIndex);

} // namespace core_canvas

#endif
