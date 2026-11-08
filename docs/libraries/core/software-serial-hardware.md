# Software serial hardware

Low-level software UART driver. Prefer `@embedito95/software-serial`, which
wraps this library.

```e95
import { openPort, sendByte } from '@embedito95/software-serial-hardware'
```

## Configuration

| API | Description |
| --- | --- |
| `getReceiveCapacity(): u8` | Size of the shared receive buffer. |
| `isBaudRateSupported(baudRate: u32): boolean` | Whether the driver can generate that speed. |
| `isReceivePin(pin: Pin): boolean` | Whether the pin can receive. |
| `getPinChangeGroup(pin: Pin): u8` | Pin-change group of the pin. |
| `getPinChangeBit(pin: Pin): u8` | Pin-change bit of the pin. |
| `openPort(transmitPin: Pin, receivePin: Pin, baudRate: u32): boolean` | Configures a port; `true` on success. |
| `closePort(transmitPin: Pin, receivePin: Pin): void` | Releases the port. |

## Receive

| API | Description |
| --- | --- |
| `startReceive(receivePin: Pin): void` | Starts listening on the pin. |
| `stopReceive(receivePin: Pin): void` | Stops listening. |
| `isReceiving(receivePin: Pin): boolean` | Whether the pin is listening. |
| `hasBufferedData(): boolean` | Whether a byte is buffered. |
| `readBufferedByte(): u8` | Removes and returns the next buffered byte. |
| `peekBufferedByte(): u8` | Returns the next byte without removing it. |
| `hasReceiveOverflow(): boolean` | Whether the buffer overflowed. |
| `storeReceivedByte(value: u8): void` | Pushes a byte into the shared buffer. |
| `readStreamLine(): string` | Reads a line from the buffered data. |
| `readStreamInteger(): i32` | Reads an integer from the buffered data. |

## Transmit

| API | Description |
| --- | --- |
| `sendByte(transmitPin: Pin, value: u8): void` | Sends one byte on the transmit pin. |
