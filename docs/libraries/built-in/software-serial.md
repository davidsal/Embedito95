# Software serial

Serial port implemented on GPIO pins.

```e95
import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'

const port = getSoftwareSerial(Pin.10, Pin.11)
```

| API | Description |
| --- | --- |
| `getSoftwareSerialReceiveCapacity(): u8` | Size of the shared receive buffer. |
| `getSoftwareSerial(transmitPin: Pin, receivePin: Pin): SoftwareSerialPort` | Creates a port on two pins. |

## SoftwareSerialPort

| API | Description |
| --- | --- |
| `initialize(baudRate: u32): void` | Opens the port at the given speed. |
| `close(): void` | Releases the port. |
| `flushOutput(): void` | Waits until transmission finishes. |
| `send(data: string): void` | Sends text without a newline. |
| `sendLine(data: string): void` | Sends text followed by a newline. |
| `read(): u8 \| null` | Next received byte, or `null`. |
| `readLine(): string` | Reads a line. |
| `readInteger(): i32` | Parses an integer. |
| `hasData(): boolean` | True when a byte is available. |
| `startListening(): void` | Starts receiving. |
| `stopListening(): void` | Stops receiving. |
| `isListening(): boolean` | Whether it is receiving. |
| `hasOverflowed(): boolean` | Whether the buffer overflowed. |
| `getNextByte(): u8 \| null` | Pops the next buffered byte. |

Receive uses pin-change interrupts, so only supported pins can listen.
