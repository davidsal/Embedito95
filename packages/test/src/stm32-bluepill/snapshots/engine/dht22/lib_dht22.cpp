#include "lib_dht22.h"

namespace lib_dht22 {

nullable<f32> getTemperature(core_object::Object<Dht22Sensor> &self) {
	return getReading(self, Type::TEMPERATURE);
}

nullable<f32> getHumidity(core_object::Object<Dht22Sensor> &self) {
	return getReading(self, Type::HUMIDITY);
}

nullable<f32> getReading(core_object::Object<Dht22Sensor> &self, Type type) {
	if (core_time::hasElapsedMicros(self->lastFetch, READ_INTERVAL_MICROS)) {
		nullable<core_object::Object<readSensorReturn>> result = readSensor(self->pin);

		if (result.isNull) {
			return nullable<f32>{ true, 0.0f };
		}

		self->lastFetch = core_time::getMicros();
		self->lastTemperature = result.value->temperature;
		self->lastHumidity = result.value->humidity;
	}

	if (type == Type::TEMPERATURE) {
		return nullable<f32>{ false, self->lastTemperature };
	}

	return nullable<f32>{ false, self->lastHumidity };
}

core_object::Object<Dht22Sensor> getSensor(core_gpio::Pin pin) {
	return core_object::Object<Dht22Sensor>(Dht22Sensor{ pin, 0.0f, 0.0f, 0 });
}

boolean waitForLevelChange(core_gpio::Pin pin, core_gpio::DigitalLevel level) {
	const u32 start = core_time::getMicros();

	while (core_gpio::getDigital(pin) == level) {
		if (core_time::hasElapsedMicros(start, READ_TIMEOUT_MICROS)) {
			return false;
		}
	}

	return true;
}

nullable<u8> readByte(core_gpio::Pin pin) {
	u8 value = 0;

	for (i32 bit = 0; bit < (i32)(8); bit += 1) {
		if (!(waitForLevelChange(pin, core_gpio::HIGH))) {
			return nullable<u8>{ true, 0 };
		}

		if (!(waitForLevelChange(pin, core_gpio::LOW))) {
			return nullable<u8>{ true, 0 };
		}

		core_time::delayMicros(40);

		if (core_gpio::getDigital(pin) == core_gpio::HIGH) {
			value = (u8)(((i32)(value) * (i32)(2)) + (i32)(1));
		} else {
			value = (u8)((i32)(value) * (i32)(2));
		}
	}

	return nullable<u8>{ false, value };
}

nullable<core_object::Object<readSensorReturn>> readSensor(core_gpio::Pin pin) {
	core_gpio::setMode(pin, core_gpio::OUTPUT);
	core_gpio::setDigital(pin, core_gpio::LOW);
	core_time::delayMicros(20000);
	core_gpio::setMode(pin, core_gpio::INPUT);
	core_time::delayMicros(50);

	if (!(waitForLevelChange(pin, core_gpio::LOW))) {
		return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
	}

	if (!(waitForLevelChange(pin, core_gpio::HIGH))) {
		return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
	}

	const nullable<u8> humidityHigh = readByte(pin);
	const nullable<u8> humidityLow = readByte(pin);
	const nullable<u8> temperatureHigh = readByte(pin);
	const nullable<u8> temperatureLow = readByte(pin);
	const nullable<u8> checksum = readByte(pin);

	if (humidityHigh.isNull) {
		return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
	}
	if (humidityLow.isNull) {
		return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
	}
	if (temperatureHigh.isNull) {
		return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
	}
	if (temperatureLow.isNull) {
		return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
	}
	if (checksum.isNull) {
		return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
	}

	const f32 humidity = ((f32)((((i32)(((u16)(humidityHigh.value))) * (i32)(BYTE_SCALE)) + (i32)(((u16)(humidityLow.value)))))) / TENTH_DIVISOR;
	const f32 temperature = ((f32)((((i32)(((u16)(temperatureHigh.value))) * (i32)(BYTE_SCALE)) + (i32)(((u16)(temperatureLow.value)))))) / TENTH_DIVISOR;
	const boolean success = (((((i32)(humidityHigh.value) + (i32)(humidityLow.value)) + (i32)(temperatureHigh.value)) + (i32)(temperatureLow.value)) % (i32)(BYTE_SCALE)) == (u16)(checksum.value);

	if (success) {
		return nullable<core_object::Object<readSensorReturn>>{ false, core_object::Object<readSensorReturn>(readSensorReturn{ humidity, temperature }) };
	}
	return nullable<core_object::Object<readSensorReturn>>{ true, core_object::Object<readSensorReturn>::null() };
}

}