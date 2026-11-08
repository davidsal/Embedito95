#include "lib_ssd1306.h"

namespace lib_ssd1306 {

void initialize(core_object::Object<Ssd1306Display> &self) {
	initializeDisplayTransport(self->transport);
	core_time::delay(POWER_ON_DELAY_MILLIS);
	sendCommand(self, DISPLAY_OFF);
	sendCommand(self, SET_DISPLAY_CLOCK_DIVIDE);
	sendCommand(self, CLOCK_DIVIDE_VALUE);
	sendCommand(self, SET_MULTIPLEX);
	sendCommand(self, MULTIPLEX_VALUE);
	sendCommand(self, SET_DISPLAY_OFFSET);
	sendCommand(self, DISPLAY_OFFSET_VALUE);
	sendCommand(self, SET_START_LINE);
	sendCommand(self, SET_CHARGE_PUMP);
	sendCommand(self, CHARGE_PUMP_VALUE);
	sendCommand(self, SET_MEMORY_MODE);
	sendCommand(self, MEMORY_MODE_VALUE);
	sendCommand(self, SEGMENT_REMAP);
	sendCommand(self, COM_SCAN_DEC);
	sendCommand(self, SET_COM_PINS);
	sendCommand(self, COM_PINS_VALUE);
	sendCommand(self, SET_CONTRAST);
	sendCommand(self, CONTRAST_VALUE);
	sendCommand(self, SET_PRECHARGE);
	sendCommand(self, PRECHARGE_VALUE);
	sendCommand(self, SET_VCOM_DETECT);
	sendCommand(self, VCOM_DETECT_VALUE);
	sendCommand(self, RESUME_TO_RAM);
	sendCommand(self, NORMAL_DISPLAY);
	sendCommand(self, DISPLAY_ON);
}

void clearDisplay(core_object::Object<Ssd1306Display> &self) {
	for (u8 page = 0; page < PAGE_COUNT; page += 1) {
		self->cursorY = ((u16)(page)) * (u16)(PAGE_HEIGHT);
		self->cursorX = 0;
		positionCursor(self);
		u16 remaining = 128;
		while ((i32)(remaining) > (i32)(0)) {
			core_array::Array<u8> bytes;
			u16 count = 30;
			if (remaining < count) {
				count = remaining;
			}
			for (u16 column = 0; column < count; column += 1) {
				bytes.push(0);
			}
			writeDisplayTransportBlock(self->transport, CONTROL_DATA, DATA_LEVEL, bytes);
			remaining = (u16)((i32)(remaining) - (i32)(count));
		}
	}
	self->cursorX = 0;
	self->cursorY = 0;
}

void setCursor(core_object::Object<Ssd1306Display> &self, u16 x, u16 y) {
	self->cursorX = x;
	self->cursorY = y;
}

void setTextScale(core_object::Object<Ssd1306Display> &self, u8 scale) {
	self->textScale = scale;
}

void write(core_object::Object<Ssd1306Display> &self, core_string::String text) {
	const i16 scale = self->textScale;
	const u8 pageCount = (u8)((((i32)(((((u16)(FONT_ROWS)) * ((u16)(scale))) + (u16)(PAGE_HEIGHT))) - (i32)(1)) / (i32)(PAGE_HEIGHT)));
	const u16 advance = (u16)(((i16)(CHAR_ADVANCE) * (i16)(scale)));
	const u16 startX = self->cursorX;
	const u16 baseY = self->cursorY;
	for (u8 page = 0; page < pageCount; page += 1) {
		self->cursorX = startX;
		self->cursorY = baseY + (((u16)(page)) * (u16)(PAGE_HEIGHT));
		positionCursor(self);
		core_array::Array<u8> payload;
		for (u16 index = 0; index < text.length(); index += 1) {
			for (u8 column = 0; column < CHAR_ADVANCE; column += 1) {
				u8 scaledByte = 0;
				if (column < GLYPH_WIDTH) {
					scaledByte = getScaledColumnByte(self, core_canvas::getGlyphColumn(text[index], column), page, scale);
				}
				for (u8 rep = 0; rep < scale; rep += 1) {
					payload.push(scaledByte);
					if (payload.length() >= WRITE_CHUNK) {
						writeDisplayTransportBlock(self->transport, CONTROL_DATA, DATA_LEVEL, payload);
						payload = {  };
					}
				}
			}
		}
		if ((i32)(payload.length()) > (i32)(0)) {
			writeDisplayTransportBlock(self->transport, CONTROL_DATA, DATA_LEVEL, payload);
		}
	}
	self->cursorX = startX + (u16)((text.length() * advance));
	self->cursorY = baseY;
}

void sendCommand(core_object::Object<Ssd1306Display> &self, u8 command) {
	core_array::Array<u8> bytes;
	bytes.push(command);
	writeDisplayTransportBlock(self->transport, CONTROL_COMMAND, COMMAND_LEVEL, bytes);
}

void positionCursor(core_object::Object<Ssd1306Display> &self) {
	const u8 page = (u8)((self->cursorY / (u16)(PAGE_HEIGHT)));
	const u8 columnLow = (u8)((self->cursorX % COLUMNS_PER_PAGE));
	const u8 columnHigh = (u8)((self->cursorX / COLUMNS_PER_PAGE));
	core_array::Array<u8> bytes;
	bytes.push(((i16)(PAGE_BASE) + (i16)(page)));
	bytes.push(columnLow);
	bytes.push(((i16)(COLUMN_HIGH_BASE) + (i16)(columnHigh)));
	writeDisplayTransportBlock(self->transport, CONTROL_COMMAND, COMMAND_LEVEL, bytes);
}

u16 pow2(core_object::Object<Ssd1306Display> &self, u8 exponent) {
	u16 value = 1;
	for (u8 i = 0; i < exponent; i += 1) {
		value = (u16)((i32)(value) * (i32)(2));
	}
	return value;
}

u8 getScaledColumnByte(core_object::Object<Ssd1306Display> &self, u8 source, u8 page, u8 scale) {
	u8 result = 0;
	for (u8 row = 0; row < FONT_ROWS; row += 1) {
		u16 divided = source;
		for (u8 i = 0; i < row; i += 1) {
			divided = (u16)((i32)(divided) / (i32)(2));
		}
		if (((i32)(divided) % (i32)(2)) == (i32)(1)) {
			for (u8 k = 0; k < scale; k += 1) {
				const i16 globalRow = (((i16)(row)) * ((i16)(scale))) + ((i16)(k));
				const i16 pageRow = globalRow - (((i16)(page)) * (i16)(PAGE_HEIGHT));
				if ((pageRow >= (i16)(0) && pageRow < ((i16)(PAGE_HEIGHT)))) {
					result = (u8)(((u16)(result) + pow2(self, (u8)(pageRow))));
				}
			}
		}
	}
	return result;
}

core_object::Object<Ssd1306Display> createDisplay(core_object::Object<DisplayTransport> transport) {
	return core_object::Object<Ssd1306Display>(Ssd1306Display{ transport, 0, 0, 1 });
}

core_object::Object<DisplayTransport> createDisplayTransport(u8 i2cChannel, u8 spiChannel, u8 chipSelectChannel, u8 dataCommandChannel, boolean usesSpi) {
	return core_object::Object<DisplayTransport>(DisplayTransport{ i2cChannel, spiChannel, chipSelectChannel, dataCommandChannel, usesSpi });
}

void initializeDisplayTransport(core_object::Object<DisplayTransport> transport) {
	if (transport->usesSpi) {
		const core_gpio::Pin chipSelect = (core_gpio::Pin)(transport->chipSelectChannel);
		const core_gpio::Pin dataCommand = (core_gpio::Pin)(transport->dataCommandChannel);
		core_spi::SpiBus bus = core_spi::getSPI((core_spi::SPI)(transport->spiChannel));
		core_gpio::setMode(chipSelect, core_gpio::OUTPUT);
		core_gpio::setMode(dataCommand, core_gpio::OUTPUT);
		core_gpio::setDigital(chipSelect, core_gpio::HIGH);
		bus.initialize();
		bus.setClockMode(core_spi::MODE_0);
		bus.setBitOrder(core_spi::MSB_FIRST);
		bus.setClockDivider(SPI_CLOCK_DIVIDER);
	} else {
		core_i2c::I2CBus bus = core_i2c::getI2C((core_i2c::I2C)(transport->i2cChannel));
		bus.initialize();
	}
}

void writeI2cDisplayBlock(core_object::Object<DisplayTransport> transport, u8 controlByte, core_array::Array<u8> bytes) {
	core_array::Array<u8> payload;
	payload.push(controlByte);
	for (u16 index = 0; index < bytes.length(); index += 1) {
		payload.push(bytes[index]);
	}
	core_i2c::I2CBus bus = core_i2c::getI2C((core_i2c::I2C)(transport->i2cChannel));
	bus.write(DISPLAY_I2C_ADDRESS, payload);
}

void writeSpiDisplayBlock(core_object::Object<DisplayTransport> transport, boolean isData, core_array::Array<u8> bytes) {
	const core_gpio::Pin chipSelect = (core_gpio::Pin)(transport->chipSelectChannel);
	const core_gpio::Pin dataCommand = (core_gpio::Pin)(transport->dataCommandChannel);
	core_spi::SpiBus bus = core_spi::getSPI((core_spi::SPI)(transport->spiChannel));
	core_gpio::setDigital(chipSelect, core_gpio::LOW);
	if (isData) {
		core_gpio::setDigital(dataCommand, core_gpio::HIGH);
	} else {
		core_gpio::setDigital(dataCommand, core_gpio::LOW);
	}
	bus.write(bytes);
	core_gpio::setDigital(chipSelect, core_gpio::HIGH);
}

void writeDisplayTransportBlock(core_object::Object<DisplayTransport> transport, u8 controlByte, boolean isData, core_array::Array<u8> bytes) {
	if (transport->usesSpi) {
		writeSpiDisplayBlock(transport, isData, bytes);
	} else {
		writeI2cDisplayBlock(transport, controlByte, bytes);
	}
}

core_object::Object<Ssd1306Display> getDisplayI2C(core_i2c::I2C i2c) {
	core_object::Object<DisplayTransport> transport = createDisplayTransport((u8)(i2c), INVALID_CHANNEL, INVALID_CHANNEL, INVALID_CHANNEL, false);
	return createDisplay(transport);
}

core_object::Object<Ssd1306Display> getDisplaySPI(core_spi::SPI spi, core_gpio::Pin cs, core_gpio::Pin dc) {
	core_object::Object<DisplayTransport> transport = createDisplayTransport(INVALID_CHANNEL, (u8)(spi), (u8)(cs), (u8)(dc), true);
	return createDisplay(transport);
}

}