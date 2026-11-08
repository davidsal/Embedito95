// CORE
#include "core/spi/core_spi.h"
#include "core/gpio/core_gpio.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
// LIBRARIES
#include "libraries/max7219/lib_max7219.h"

core_object::Object<lib_max7219::LedMatrix> matrix = lib_max7219::getMatrix(core_spi::SPI::SPI_1, core_gpio::Pin::PIN_A4);

int main() {
	// SETUP
	initializeSystemClock();
	lib_max7219::initialize(matrix);
	lib_max7219::setIntensity(matrix, 8);

	// MAIN
	lib_max7219::clear(matrix);
	lib_max7219::setPixel(matrix, 0, 0, true);
	lib_max7219::setPixel(matrix, 3, 3, true);
	lib_max7219::setPixel(matrix, 0, 0, false);
}
