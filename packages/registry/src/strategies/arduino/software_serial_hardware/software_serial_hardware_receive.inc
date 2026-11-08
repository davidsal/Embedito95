void handlePinChangeInterrupt(u8 group) {
	if (activeReceivePin == NO_PIN) {
		return;
	}
	if (resolvePinChangeGroup((core_gpio::Pin)activeReceivePin) != group) {
		return;
	}

	const PortRegisters *port = resolvePort((core_gpio::Pin)activeReceivePin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask((core_gpio::Pin)activeReceivePin);

	// A pin-change interrupt also fires on rising edges and on other pins of
	// the same port; only a low start bit belongs to a frame.
	if ((*port->input & mask) != 0) {
		return;
	}

	setReceiveMask(false);
	_delay_loop_2(receiveCenteringDelay);

	u8 value = 0;
	for (u8 index = 0; index < DATA_BIT_COUNT; index++) {
		_delay_loop_2(receiveBitDelay);
		value >>= 1;
		if ((*port->input & mask) != 0) {
			value |= MOST_SIGNIFICANT_BIT;
		}
	}

	_delay_loop_2(receiveStopDelay);

	// A low stop bit means the frame is malformed (framing error); discard it
	// instead of injecting a corrupted byte into the stream.
	if ((*port->input & mask) != 0) {
		storeReceivedByte(value);
	}

	PCIFR = (u8)_BV(group);
	setReceiveMask(true);
}
