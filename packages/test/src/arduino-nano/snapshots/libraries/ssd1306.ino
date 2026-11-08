// CORE
#include <core_i2c.h>
#include <core_spi.h>
#include <core_gpio.h>
#include <core_canvas.h>
#include <core_time.h>
#include <core_system.h>
#include <core_type.h>
// LIBRARIES
#include <lib_ssd1306.h>

core_object::Object<lib_ssd1306::Ssd1306Display> i2cDisplay = lib_ssd1306::getDisplayI2C(core_i2c::I2C::I2C_1);
core_object::Object<lib_ssd1306::Ssd1306Display> spiDisplay = lib_ssd1306::getDisplaySPI(core_spi::SPI::SPI_1, core_gpio::Pin::PIN_10, core_gpio::Pin::PIN_9);

void setup() {
	// SETUP
	lib_ssd1306::initialize(i2cDisplay);
	lib_ssd1306::setTextScale(i2cDisplay, 2);
	lib_ssd1306::initialize(spiDisplay);
	lib_ssd1306::setTextScale(spiDisplay, 2);

	// MAIN
	lib_ssd1306::clearDisplay(i2cDisplay);
	lib_ssd1306::setCursor(i2cDisplay, 0, 0);
	lib_ssd1306::write(i2cDisplay, F("Hello"));
	lib_ssd1306::setCursor(i2cDisplay, 0, 16);
	lib_ssd1306::write(i2cDisplay, F("World"));

	lib_ssd1306::clearDisplay(spiDisplay);
	lib_ssd1306::setCursor(spiDisplay, 0, 0);
	lib_ssd1306::write(spiDisplay, F("Hello"));
	lib_ssd1306::setCursor(spiDisplay, 0, 16);
	lib_ssd1306::write(spiDisplay, F("World"));
}

void loop() {
}
