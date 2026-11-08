# Canvas

Bitmap font data used by display drivers.

```e95
import { getGlyphColumn } from '@embedito95/canvas'
```

| API | Description |
| --- | --- |
| `getGlyphColumn(character: char, columnIndex: u8): u8` | One column of the 5x7 glyph; columns are 7 bits, least significant bit on top. |

Out-of-range characters or columns return `0`.
