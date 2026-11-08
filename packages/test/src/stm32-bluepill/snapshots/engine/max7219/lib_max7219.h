#ifndef LIB_MAX7219_H
#define LIB_MAX7219_H

// CORE
#include "../../core/spi/core_spi.h"
#include "../../core/gpio/core_gpio.h"
#include "../../core/system/core_system.h"
#include "../../core/type/core_type.h"

namespace lib_max7219 {

struct LedMatrix {
	core_gpio::Pin cs;
	core_spi::SpiBus bus;
	core_array::Array<u8> rows;
};

const u8 REG_DIGIT_0 = 1;
const u8 REG_DECODE_MODE = 9;
const u8 REG_INTENSITY = 10;
const u8 REG_SCAN_LIMIT = 11;
const u8 REG_SHUTDOWN = 12;
const u8 REG_DISPLAY_TEST = 15;
const u8 DECODE_NONE = 0;
const u8 SCAN_ALL = 7;
const u8 SHUTDOWN_OFF = 1;
const u8 DISPLAY_TEST_OFF = 0;
const u8 DEFAULT_INTENSITY = 8;
const u8 MATRIX_WIDTH = 8;
const u8 MATRIX_HEIGHT = 8;

void initialize(core_object::Object<LedMatrix> &self);
void clear(core_object::Object<LedMatrix> &self);
void setPixel(core_object::Object<LedMatrix> &self, u8 x, u8 y, boolean on);
void setRow(core_object::Object<LedMatrix> &self, u8 row, u8 value);
void drawImage(core_object::Object<LedMatrix> &self, core_array::Array<u8> bitmap);
void setIntensity(core_object::Object<LedMatrix> &self, u8 intensity);
void send(core_object::Object<LedMatrix> &self, u8 address, u8 value);
void writeRow(core_object::Object<LedMatrix> &self, u8 row);
void writeRowValue(core_object::Object<LedMatrix> &self, u8 row, u8 value);
void setBit(core_object::Object<LedMatrix> &self, u8 row, u8 bit, boolean on);
core_object::Object<LedMatrix> getMatrix(core_spi::SPI spi, core_gpio::Pin cs);
boolean bitIsSet(u8 value, u8 bit);
u8 pow2(u8 exponent);

}

#endif