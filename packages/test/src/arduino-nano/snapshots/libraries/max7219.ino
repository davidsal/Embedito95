// CORE
#include <core_spi.h>
#include <core_gpio.h>
#include <core_system.h>
#include <core_type.h>
// LIBRARIES
#include <lib_max7219.h>

core_object::Object<lib_max7219::LedMatrix> matrix = lib_max7219::getMatrix(core_spi::SPI::SPI_1, core_gpio::Pin::PIN_10);

void setup() {
	// SETUP
	lib_max7219::initialize(matrix);
	lib_max7219::setIntensity(matrix, 8);

	// MAIN
	lib_max7219::clear(matrix);
	lib_max7219::setPixel(matrix, 0, 0, true);
	lib_max7219::setPixel(matrix, 3, 3, true);
	lib_max7219::setPixel(matrix, 0, 0, false);
}

void loop() {
}
