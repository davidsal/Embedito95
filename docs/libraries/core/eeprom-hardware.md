# EEPROM hardware

Direct access to the non-volatile cells of the board.

```e95
import { getCellCount, readCell, writeCell } from '@embedito95/eeprom-hardware'
```

| API | Description |
| --- | --- |
| `getCellCount(): u16` | Number of addressable cells. |
| `readCell(address: u16): u8` | Reads a cell; unwritten or out-of-range cells read `0xFF`. |
| `writeCell(address: u16, value: u8): void` | Writes a cell and blocks until the write completes. |
| `updateCell(address: u16, value: u8): void` | Writes only when the value changed, avoiding wear. |

For bytes and blocks with bounds checks, use `@embedito95/eeprom`.
