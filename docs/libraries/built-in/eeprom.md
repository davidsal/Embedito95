# EEPROM

Byte and block access to non-volatile memory with bounds checks.

```e95
import { readEepromByte, writeEepromBlock } from '@embedito95/eeprom'
```

| API | Description |
| --- | --- |
| `getCapacity(): u16` | Number of usable bytes. |
| `readEepromByte(address: u16): u8` | Reads one byte. |
| `writeEepromByte(address: u16, value: u8): void` | Writes one byte. |
| `updateEepromByte(address: u16, value: u8): void` | Writes only when the value changed. |
| `readEepromBlock(address: u16, length: u16): u8[]` | Reads a block. |
| `writeEepromBlock(address: u16, data: u8[]): void` | Writes a block. |

`updateEepromByte` avoids unnecessary writes, which extend the life of the
cells.
