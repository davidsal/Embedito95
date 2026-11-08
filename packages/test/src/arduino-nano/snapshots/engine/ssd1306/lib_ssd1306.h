#ifndef LIB_SSD1306_H
#define LIB_SSD1306_H

// CORE
#include <core_i2c.h>
#include <core_spi.h>
#include <core_gpio.h>
#include <core_canvas.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>

namespace lib_ssd1306 {

struct DisplayTransport {
	u8 i2cChannel;
	u8 spiChannel;
	u8 chipSelectChannel;
	u8 dataCommandChannel;
	boolean usesSpi;
};

struct Ssd1306Display {
	core_object::Object<DisplayTransport> transport;
	u16 cursorX;
	u16 cursorY;
	u8 textScale;
};

const u8 DISPLAY_I2C_ADDRESS = 60;
const u8 CONTROL_COMMAND = 0;
const u8 CONTROL_DATA = 64;
const u8 INVALID_CHANNEL = 255;
const u16 DISPLAY_WIDTH = 128;
const u8 PAGE_HEIGHT = 8;
const u8 PAGE_COUNT = 8;
const u16 COLUMNS_PER_PAGE = 16;
const u8 PAGE_BASE = 176;
const u8 COLUMN_HIGH_BASE = 16;
const u8 GLYPH_WIDTH = 5;
const u8 CHAR_ADVANCE = 6;
const u8 FONT_ROWS = 7;
const u16 CLEAR_CHUNK = 30;
const u16 WRITE_CHUNK = 30;
const u8 POWER_ON_DELAY_MILLIS = 10;
const u16 SPI_CLOCK_DIVIDER = 8;
const boolean COMMAND_LEVEL = false;
const boolean DATA_LEVEL = true;
const u8 DISPLAY_OFF = 174;
const u8 SET_DISPLAY_CLOCK_DIVIDE = 213;
const u8 CLOCK_DIVIDE_VALUE = 128;
const u8 SET_MULTIPLEX = 168;
const u8 MULTIPLEX_VALUE = 63;
const u8 SET_DISPLAY_OFFSET = 211;
const u8 DISPLAY_OFFSET_VALUE = 0;
const u8 SET_START_LINE = 64;
const u8 SET_CHARGE_PUMP = 141;
const u8 CHARGE_PUMP_VALUE = 20;
const u8 SET_MEMORY_MODE = 32;
const u8 MEMORY_MODE_VALUE = 0;
const u8 SEGMENT_REMAP = 161;
const u8 COM_SCAN_DEC = 200;
const u8 SET_COM_PINS = 218;
const u8 COM_PINS_VALUE = 18;
const u8 SET_CONTRAST = 129;
const u8 CONTRAST_VALUE = 207;
const u8 SET_PRECHARGE = 217;
const u8 PRECHARGE_VALUE = 241;
const u8 SET_VCOM_DETECT = 219;
const u8 VCOM_DETECT_VALUE = 64;
const u8 RESUME_TO_RAM = 164;
const u8 NORMAL_DISPLAY = 166;
const u8 DISPLAY_ON = 175;

void initialize(core_object::Object<Ssd1306Display> &self);
void clearDisplay(core_object::Object<Ssd1306Display> &self);
void setCursor(core_object::Object<Ssd1306Display> &self, u16 x, u16 y);
void setTextScale(core_object::Object<Ssd1306Display> &self, u8 scale);
void write(core_object::Object<Ssd1306Display> &self, core_string::String text);
void sendCommand(core_object::Object<Ssd1306Display> &self, u8 command);
void positionCursor(core_object::Object<Ssd1306Display> &self);
u16 pow2(core_object::Object<Ssd1306Display> &self, u8 exponent);
u8 getScaledColumnByte(core_object::Object<Ssd1306Display> &self, u8 source, u8 page, u8 scale);
core_object::Object<Ssd1306Display> createDisplay(core_object::Object<DisplayTransport> transport);
core_object::Object<DisplayTransport> createDisplayTransport(u8 i2cChannel, u8 spiChannel, u8 chipSelectChannel, u8 dataCommandChannel, boolean usesSpi);
void initializeDisplayTransport(core_object::Object<DisplayTransport> transport);
void writeI2cDisplayBlock(core_object::Object<DisplayTransport> transport, u8 controlByte, core_array::Array<u8> bytes);
void writeSpiDisplayBlock(core_object::Object<DisplayTransport> transport, boolean isData, core_array::Array<u8> bytes);
void writeDisplayTransportBlock(core_object::Object<DisplayTransport> transport, u8 controlByte, boolean isData, core_array::Array<u8> bytes);
core_object::Object<Ssd1306Display> getDisplayI2C(core_i2c::I2C i2c);
core_object::Object<Ssd1306Display> getDisplaySPI(core_spi::SPI spi, core_gpio::Pin cs, core_gpio::Pin dc);

}

#endif