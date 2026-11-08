#ifndef LIB_DHT22_H
#define LIB_DHT22_H

// CORE
#include "../../core/serial/core_serial.h"
#include "../../core/gpio/core_gpio.h"
#include "../../core/time/core_time.h"
#include "../../core/system/core_system.h"
#include "../../core/type/core_type.h"

namespace lib_dht22 {

typedef enum : u8 {
	TEMPERATURE,
	HUMIDITY
} Type;

struct Dht22Sensor {
	core_gpio::Pin pin;
	f32 lastTemperature;
	f32 lastHumidity;
	u32 lastFetch;
};

struct readSensorReturn {
	f32 humidity;
	f32 temperature;
};

const u32 READ_INTERVAL_MICROS = 2000000;
const u32 READ_TIMEOUT_MICROS = 10000;
const u16 BYTE_SCALE = 256;
const f32 TENTH_DIVISOR = 10;

nullable<f32> getTemperature(core_object::Object<Dht22Sensor> &self);
nullable<f32> getHumidity(core_object::Object<Dht22Sensor> &self);
nullable<f32> getReading(core_object::Object<Dht22Sensor> &self, Type type);
core_object::Object<Dht22Sensor> getSensor(core_gpio::Pin pin);
boolean waitForLevelChange(core_gpio::Pin pin, core_gpio::DigitalLevel level);
nullable<u8> readByte(core_gpio::Pin pin);
nullable<core_object::Object<readSensorReturn>> readSensor(core_gpio::Pin pin);

}

#endif