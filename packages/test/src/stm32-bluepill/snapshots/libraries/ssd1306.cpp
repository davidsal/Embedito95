// CORE
#include "core/i2c/core_i2c.h"
#include "core/spi/core_spi.h"
#include "core/gpio/core_gpio.h"
#include "core/canvas/core_canvas.h"
#include "core/time/core_time.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
// LIBRARIES
#include "libraries/ssd1306/lib_ssd1306.h"

core_object::Object<lib_ssd1306::Ssd1306Display> i2cDisplay = lib_ssd1306::getDisplayI2C(core_i2c::I2C::I2C_1);
core_object::Object<lib_ssd1306::Ssd1306Display> spiDisplay = lib_ssd1306::getDisplaySPI(core_spi::SPI::SPI_1, core_gpio::Pin::PIN_A4, core_gpio::Pin::PIN_A8);

int main() {
	// SETUP
	initializeSystemClock();
	lib_ssd1306::initialize(i2cDisplay);
	lib_ssd1306::setTextScale(i2cDisplay, 2);
	lib_ssd1306::initialize(spiDisplay);
	lib_ssd1306::setTextScale(spiDisplay, 2);

	// MAIN
	lib_ssd1306::clearDisplay(i2cDisplay);
	lib_ssd1306::setCursor(i2cDisplay, 0, 0);
	lib_ssd1306::write(i2cDisplay, "Hello");
	lib_ssd1306::setCursor(i2cDisplay, 0, 16);
	lib_ssd1306::write(i2cDisplay, "World");

	lib_ssd1306::clearDisplay(spiDisplay);
	lib_ssd1306::setCursor(spiDisplay, 0, 0);
	lib_ssd1306::write(spiDisplay, "Hello");
	lib_ssd1306::setCursor(spiDisplay, 0, 16);
	lib_ssd1306::write(spiDisplay, "World");
}
