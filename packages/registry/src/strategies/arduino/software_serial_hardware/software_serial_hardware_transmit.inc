void writeTransmitLevel(core_gpio::Pin pin, boolean high) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);

	if (high) {
		*port->output |= mask;
	} else {
		*port->output &= (u8)~mask;
	}
}

void transmitByte(core_gpio::Pin pin, u8 value) {
	const u8 number = (u8)pin;

	if (number > LAST_PIN) {
		return;
	}

	const u16 bitDelay = bitDelayByPin[number];

	if (bitDelay == 0) {
		return;
	}

	const u16 transmitDelay = subtractCap(bitDelay, TX_OVERHEAD_LOOP_UNITS);
	const u8 savedInterruptState = saveAndDisableInterrupts();

	writeTransmitLevel(pin, false);
	_delay_loop_2(transmitDelay);

	for (u8 index = 0; index < DATA_BIT_COUNT; index++) {
		writeTransmitLevel(pin, (boolean)((value & (u8)_BV(index)) != 0));
		_delay_loop_2(transmitDelay);
	}

	writeTransmitLevel(pin, true);
	restoreInterruptState(savedInterruptState);
	_delay_loop_2(transmitDelay);
}
