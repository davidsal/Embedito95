# I2C

I2C master and slave buses.

```e95
import { getI2C, I2C, I2CStatus } from '@embedito95/i2c'

const bus = getI2C(I2C.1)
```

- `I2C` lists the buses of the board.
- `I2CStatus`: `OK`, `DATA_TOO_LONG`, `ADDRESS_NACK`, `DATA_NACK` and `OTHER`.

| API | Description |
| --- | --- |
| `initialize(): void` | Configures the bus as master. |
| `setClock(frequency: u32): void` | Sets the bus clock. |
| `close(): void` | Releases the bus. |
| `beginWrite(address: u8): void` | Starts a transaction to a slave address. |
| `sendByte(value: u8): void` | Queues one byte for the transaction. |
| `endWrite(): I2CStatus` | Ends the transaction and reports the result. |
| `write(address: u8, data: u8[]): void` | Writes a buffer in one transaction. |
| `requestFrom(address: u8, quantity: u8): u8` | Requests bytes from a slave and returns how many arrived. |
| `read(): u8` | Reads one received byte. |
| `available(): u8` | Bytes left in the receive buffer. |
| `initializeSlave(address: u8): void` | Configures the bus as a slave. |
| `onReceive(handler: () => void): void` | Registers a handler for write transactions. |
| `onRequest(handler: () => void): void` | Registers a handler for read transactions. |
| `sendResponse(data: u8[]): void` | Queues the response for a read transaction. |

`onReceive` and `onRequest` take a `handler: () => void`: pass a named function
or a captureless inline arrow with that exact signature. Both run in interrupt
context.
