// CORE
#include "core/spi/core_spi.h"
#include "core/system/core_system.h"
#include "core/type/core_type.h"
#include "core/gpio/core_gpio.h"

const u16 CLOCK_DIVISOR = 64;
core_spi::SpiBus bus = core_spi::getSPI(core_spi::SPI::SPI_1);

core_array::Array<u8> loopback() {
	const core_array::Array<u8> echoed = bus.transferBuffer({ 9, 8, 7 });
	bus.write(echoed);
	return echoed;
}

u16 share(u16 word) {
	bus.beginTransaction(16, core_spi::MODE_3, core_spi::MSB_FIRST);
	bus.beginTransaction(256, core_spi::MODE_1, core_spi::LSB_FIRST);
	const u16 received = bus.transfer16(word);
	bus.endTransaction();
	bus.endTransaction();
	return received;
}

int main() {
	// SETUP
	initializeSystemClock();
	bus.initialize();
	bus.setClockDivider(CLOCK_DIVISOR);
	bus.setBitOrder(core_spi::LSB_FIRST);
	bus.setClockMode(core_spi::MODE_2);

	// MAIN
	loopback();
	const u16 word = bus.transfer16(4660);
	const u16 shared = share(word);
	core_array::Array<u8> trailer = { (u8)(((i32)(word) % (i32)(256))), (u8)(((i32)(shared) % (i32)(256))) };
	bus.write(trailer);
	bus.close();
	bus.close();
}
