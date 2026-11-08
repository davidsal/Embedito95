#include "lib_max7219.h"

namespace lib_max7219 {

void initialize(core_object::Object<LedMatrix> &self) {
	core_gpio::setMode(self->cs, core_gpio::OUTPUT);
	core_gpio::setDigital(self->cs, core_gpio::HIGH);
	self->bus.initialize();
	send(self, REG_DISPLAY_TEST, DISPLAY_TEST_OFF);
	send(self, REG_SHUTDOWN, SHUTDOWN_OFF);
	send(self, REG_DECODE_MODE, DECODE_NONE);
	send(self, REG_SCAN_LIMIT, SCAN_ALL);
	send(self, REG_INTENSITY, DEFAULT_INTENSITY);
	for (u8 row = 0; row < MATRIX_HEIGHT; row += 1) {
		send(self, ((i16)(REG_DIGIT_0) + (i16)(row)), 0);
	}
}

void clear(core_object::Object<LedMatrix> &self) {
	for (u8 row = 0; row < MATRIX_HEIGHT; row += 1) {
		self->rows[row] = 0;
		writeRow(self, row);
	}
}

void setPixel(core_object::Object<LedMatrix> &self, u8 x, u8 y, boolean on) {
	if (x >= MATRIX_WIDTH) {
		return;
	}
	if (y >= MATRIX_HEIGHT) {
		return;
	}
	setBit(self, y, (((i16)(MATRIX_WIDTH) - (i16)(1)) - (i16)(x)), on);
}

void setRow(core_object::Object<LedMatrix> &self, u8 row, u8 value) {
	if (row >= MATRIX_HEIGHT) {
		return;
	}
	writeRowValue(self, row, value);
}

void drawImage(core_object::Object<LedMatrix> &self, core_array::Array<u8> bitmap) {
	for (u8 row = 0; row < MATRIX_HEIGHT; row += 1) {
		if ((u16)(row) < bitmap.length()) {
			writeRowValue(self, row, bitmap[row]);
		}
	}
}

void setIntensity(core_object::Object<LedMatrix> &self, u8 intensity) {
	send(self, REG_INTENSITY, intensity);
}

void send(core_object::Object<LedMatrix> &self, u8 address, u8 value) {
	core_gpio::setDigital(self->cs, core_gpio::LOW);
	self->bus.transfer(address);
	self->bus.transfer(value);
	core_gpio::setDigital(self->cs, core_gpio::HIGH);
}

void writeRow(core_object::Object<LedMatrix> &self, u8 row) {
	send(self, ((i16)(REG_DIGIT_0) + (i16)(row)), self->rows[row]);
}

void writeRowValue(core_object::Object<LedMatrix> &self, u8 row, u8 value) {
	self->rows[row] = value;
	writeRow(self, row);
}

void setBit(core_object::Object<LedMatrix> &self, u8 row, u8 bit, boolean on) {
	const u8 mask = pow2(bit);
	if (on) {
		if (!(bitIsSet(self->rows[row], bit))) {
			self->rows[row] = (i16)(self->rows[row]) + (i16)(mask);
			writeRow(self, row);
		}
	} else {
		if (bitIsSet(self->rows[row], bit)) {
			self->rows[row] = (i16)(self->rows[row]) - (i16)(mask);
			writeRow(self, row);
		}
	}
}

core_object::Object<LedMatrix> getMatrix(core_spi::SPI spi, core_gpio::Pin cs) {
	return core_object::Object<LedMatrix>(LedMatrix{ cs, core_spi::getSPI(spi), { 0, 0, 0, 0, 0, 0, 0, 0 } });
}

boolean bitIsSet(u8 value, u8 bit) {
	u16 divided = value;
	for (u8 i = 0; i < bit; i += 1) {
		divided = (u16)((i32)(divided) / (i32)(2));
	}
	return ((i32)(divided) % (i32)(2)) == (i32)(1);
}

u8 pow2(u8 exponent) {
	u8 value = 1;
	for (u8 i = 0; i < exponent; i += 1) {
		value = (u8)((i16)(value) * (i16)(2));
	}
	return value;
}

}