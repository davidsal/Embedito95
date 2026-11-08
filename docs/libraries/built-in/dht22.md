# DHT22

Temperature and humidity sensor on a single data pin.

```e95
import { getSensor } from '@embedito95/dht22'
import { Pin } from '@embedito95/gpio'

const sensor = getSensor(Pin.2)
```

| API | Description |
| --- | --- |
| `getSensor(pin: Pin): Dht22Sensor` | Creates a sensor handle for the data pin. |
| `getTemperature(): f32 \| null` | Temperature in Celsius, or `null` when the read fails. |
| `getHumidity(): f32 \| null` | Relative humidity as a percentage, or `null` when the read fails. |

Reads are timing-sensitive, so a long interrupt handler can make them fail.
