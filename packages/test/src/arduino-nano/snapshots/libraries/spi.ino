// CORE
#include <core_spi.h>
#include <core_system.h>
#include <core_type.h>

const u16 CLOCK_DIVISOR = 8;
core_spi::SpiBus bus = core_spi::getSPI(core_spi::SPI::SPI_1);

core_array::Array<u8> exchange() {
	const u8 firstByte = bus.transfer(0);
	const core_array::Array<u8> echoed = bus.transferBuffer({ 1, 2, 3 });
	bus.write(echoed);
	const u8 trailerByte = 4;
	core_array::Array<u8> request = { firstByte, trailerByte };
	bus.write(request);
	return echoed;
}

u16 share(u16 word) {
	bus.beginTransaction(16, core_spi::MODE_3, core_spi::LSB_FIRST);
	bus.beginTransaction(32, core_spi::MODE_1, core_spi::MSB_FIRST);
	const u16 received = bus.transfer16(word);
	bus.endTransaction();
	bus.endTransaction();
	return received;
}

void setup() {
	// SETUP
	bus.initialize();
	bus.setClockDivider(CLOCK_DIVISOR);
	bus.setBitOrder(core_spi::MSB_FIRST);
	bus.setClockMode(core_spi::MODE_0);

	// MAIN
	const core_array::Array<u8> exchanged = exchange();
	const u16 word = bus.transfer16(4660);
	const u16 shared = share(word);
	core_array::Array<u8> trailer = { (u8)(((i32)(word) % (i32)(256))), (u8)(((i32)(shared) % (i32)(256))) };
	bus.write(trailer);
	bus.close();
	bus.close();
}

void loop() {
}
