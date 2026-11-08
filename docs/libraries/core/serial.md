# Serial

UART ports with text and number helpers.

```e95
import { getSerial, Serial } from '@embedito95/serial'

const serial = getSerial(Serial.1)
```

`Serial` lists the ports of the board. `getSerial` returns a `SerialPort`.

| API | Description |
| --- | --- |
| `initialize(baudRate: u32): void` | Opens the port at the given speed. |
| `close(): void` | Releases the port. |
| `flushOutput(): void` | Waits until the transmit buffer is empty. |
| `send(data: string \| char \| u8 \| i8 \| u16 \| i16 \| u32 \| i32 \| u64 \| i64 \| f32 \| f64): void` | Sends text or a number without a newline. |
| `sendLine(data: string \| char \| u8 \| i8 \| u16 \| i16 \| u32 \| i32 \| u64 \| i64 \| f32 \| f64): void` | Sends text or a number followed by a newline. |
| `read(): u8 \| null` | Next received byte, or `null`. |
| `peekByte(): u8 \| null` | Next byte without consuming it. |
| `getWriteSpace(): u16` | Free bytes in the transmit buffer; `0` when unknown. |
| `readBlock(maximum: u16): u8[]` | Reads up to `maximum` bytes. |
| `readBlockUntil(terminator: u8, maximum: u16): u8[]` | Reads bytes until the terminator or the limit. |
| `sendBuffer(data: u8[]): void` | Sends raw bytes. |
| `readLine(): string` | Reads a line. |
| `readTextUntil(terminator: char): string` | Reads text until the terminator. |
| `readText(): string` | Reads the available text. |
| `findText(needle: string): boolean` | Waits for a text sequence. |
| `findTextUntil(needle: string, terminator: char): boolean` | Waits for a text sequence, stopping at the terminator. |
| `readInteger(): i32` | Parses an integer, or `0` when none arrives. |
| `readFloat(): f32` | Parses a float, or `0` when none arrives. |
| `setReadTimeout(milliseconds: u32): void` | Wait budget per byte. |
| `getReadTimeout(): u32` | Current wait budget. |
| `hasData(): boolean` | True when a byte is available. |
