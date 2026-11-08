# SPI

SPI buses and transactions.

```e95
import { getSPI, SPI, SpiBitOrder, SpiClockMode } from '@embedito95/spi'

const bus = getSPI(SPI.1)
```

- `SPI` lists the buses of the board.
- `SpiBitOrder`: `MSB_FIRST` and `LSB_FIRST`.
- `SpiClockMode`: `MODE_0` to `MODE_3`.

| API | Description |
| --- | --- |
| `initialize(): void` | Configures the bus as master. |
| `close(): void` | Releases the bus. |
| `setClockDivider(divider: u16): void` | Sets the clock divider. |
| `setBitOrder(order: SpiBitOrder): void` | Sets the bit order. |
| `setClockMode(mode: SpiClockMode): void` | Sets clock polarity and phase. |
| `beginTransaction(clockDivider: u16, mode: SpiClockMode, bitOrder: SpiBitOrder): void` | Locks the bus with the given settings. |
| `endTransaction(): void` | Releases the transaction. |
| `transfer(data: u8): u8` | Sends one byte and returns the received one. |
| `transfer16(value: u16): u16` | Sends two bytes and returns the received word. |
| `transferBuffer(data: u8[]): u8[]` | Transfers a buffer and returns the response. |
| `write(data: u8[]): void` | Sends a buffer without reading the response. |
