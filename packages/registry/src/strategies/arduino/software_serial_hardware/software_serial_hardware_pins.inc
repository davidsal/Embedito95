const u8 DATA_BIT_COUNT = 8;
const u8 LAST_PIN = 19;
const u8 PIN_COUNT = LAST_PIN + 1;
const u8 PIN_CHANGE_GROUP_COUNT = 3;
const u8 PIN_CHANGE_GROUP_B = 0;
const u8 PIN_CHANGE_GROUP_C = 1;
const u8 PIN_CHANGE_GROUP_D = 2;
const u8 PIN_CHANGE_NONE = 0xFF;
const u8 NO_PIN = 0xFF;
const u8 LAST_PORT_D_PIN = 7;
const u8 LAST_PORT_B_PIN = 13;
const u8 FIRST_PORT_B_PIN = 8;
const u8 FIRST_PORT_C_PIN = 14;
const u8 MOST_SIGNIFICANT_BIT = (u8)(1 << (DATA_BIT_COUNT - 1));

const u32 CYCLES_PER_SECOND = F_CPU;
const u32 BIT_DELAY_CYCLE_DIVISOR = 4;
// 300 baud is the lowest supported rate for sampling accuracy. The 16-bit loop
// counter itself would only overflow below about 61 baud
// (16000000 / (4 * 65535)); the floor is not a counter limit.
const u32 MINIMUM_BAUD_RATE = 300;
// At 57600 baud the half-bit centering delay keeps a margin above the fixed
// interrupt overhead. At 115200 only 17 loop units remain for the half bit, so
// centering saturates at one loop and the first sample depends on the assumed
// overhead; that rate is deliberately rejected.
const u32 MAXIMUM_BAUD_RATE = 57600;

// The interrupt entry, the pin sample and the loop control add a fixed number
// of cycles before each sample. The values follow the AVR code generation used
// by the Arduino toolchain; dividing them by BIT_DELAY_CYCLE_DIVISOR converts
// them to `_delay_loop_2` units (four cycles per iteration). The integer
// division truncates, so the subtractCap helper saturates the result at one
// loop instead of letting it wrap.
//
// Transmit path: the digital write that drives the start/data/stop level runs
// between two loop iterations.
const u16 TX_DIGITAL_WRITE_CYCLES = 15;
// Receive path: interrupt vector dispatch plus the register saves before the
// centering delay starts.
const u16 RX_INTERRUPT_ENTRY_CYCLES = 4;
// First `_delay_loop_2` iteration setup for the centering delay.
const u16 RX_CENTERING_LOOP_BODY_CYCLES = 4;
// ISR prologue (register pushes, mask save, port lookup) before the sample.
const u16 RX_ISR_PROLOGUE_CYCLES = 75;
// Reading PINx and testing the receive bit for the start/data sample.
const u16 RX_PIN_SAMPLE_CYCLES = 17;
// Loop-control cycles already counted by the surrounding delay iterations.
const u16 RX_LOOP_CONTROL_CYCLES = 23;
// Each data-bit `_delay_loop_2` iteration plus its loop control.
const u16 RX_DATA_LOOP_BODY_CYCLES = 23;
// Stop-bit `_delay_loop_2` iterations plus the loop control.
const u16 RX_STOP_LOOP_BODY_CYCLES = 37;
// Stop-bit pin sample and the branch that decides whether to store the byte.
const u16 RX_STOP_SAMPLE_CYCLES = 11;

const u16 TX_OVERHEAD_LOOP_UNITS =
	(TX_DIGITAL_WRITE_CYCLES / BIT_DELAY_CYCLE_DIVISOR);
const u16 RX_CENTERING_OVERHEAD_LOOP_UNITS =
	((RX_INTERRUPT_ENTRY_CYCLES + RX_CENTERING_LOOP_BODY_CYCLES +
	  RX_ISR_PROLOGUE_CYCLES + RX_PIN_SAMPLE_CYCLES -
	  RX_LOOP_CONTROL_CYCLES) /
	 BIT_DELAY_CYCLE_DIVISOR);
const u16 RX_BIT_OVERHEAD_LOOP_UNITS =
	(RX_DATA_LOOP_BODY_CYCLES / BIT_DELAY_CYCLE_DIVISOR);
const u16 RX_STOP_OVERHEAD_LOOP_UNITS =
	((RX_STOP_LOOP_BODY_CYCLES + RX_STOP_SAMPLE_CYCLES) /
	 BIT_DELAY_CYCLE_DIVISOR);
const u16 CENTERING_DIVISOR = 2;
const u16 STOP_DIVISOR_NUMERATOR = 3;
const u16 STOP_DIVISOR = 4;

struct PortRegisters {
	volatile u8 *input;
	volatile u8 *output;
	volatile u8 *direction;
};

const PortRegisters PORT_D = { &PIND, &PORTD, &DDRD };
const PortRegisters PORT_B = { &PINB, &PORTB, &DDRB };
const PortRegisters PORT_C = { &PINC, &PORTC, &DDRC };

volatile u8 *const PIN_CHANGE_MASK_REGISTERS[PIN_CHANGE_GROUP_COUNT] = {
	&PCMSK0,
	&PCMSK1,
	&PCMSK2,
};
const u8 PIN_CHANGE_ENABLE_BITS[PIN_CHANGE_GROUP_COUNT] = {
	PCIE0,
	PCIE1,
	PCIE2,
};

// Bit timing is stored per pin so two handles with different baud rates can
// transmit independently, and opening a second handle does not overwrite the
// timing of the active receiver.
u16 bitDelayByPin[PIN_COUNT];

volatile u8 activeReceivePin = NO_PIN;
volatile u16 receiveCenteringDelay = 0;
volatile u16 receiveBitDelay = 0;
volatile u16 receiveStopDelay = 0;

volatile u8 receiveBuffer[RECEIVE_CAPACITY];
volatile u8 receiveHead = 0;
volatile u8 receiveTail = 0;
volatile u8 receiveCount = 0;
volatile boolean receiveOverflowed = false;

const PortRegisters *resolvePort(core_gpio::Pin pin) {
	const u8 number = (u8)pin;

	if (number <= LAST_PORT_D_PIN) {
		return &PORT_D;
	}
	if (number <= LAST_PORT_B_PIN) {
		return &PORT_B;
	}
	if (number <= LAST_PIN) {
		return &PORT_C;
	}
	return nullptr;
}

u8 resolvePinBit(core_gpio::Pin pin) {
	const u8 number = (u8)pin;

	if (number <= LAST_PORT_D_PIN) {
		return number;
	}
	if (number <= LAST_PORT_B_PIN) {
		return (u8)(number - FIRST_PORT_B_PIN);
	}
	return (u8)(number - FIRST_PORT_C_PIN);
}

u8 resolveBitMask(core_gpio::Pin pin) {
	return (u8)_BV(resolvePinBit(pin));
}

u8 resolvePinChangeGroup(core_gpio::Pin pin) {
	const u8 number = (u8)pin;

	if (number <= LAST_PORT_D_PIN) {
		return PIN_CHANGE_GROUP_D;
	}
	if (number <= LAST_PORT_B_PIN) {
		return PIN_CHANGE_GROUP_B;
	}
	if (number <= LAST_PIN) {
		return PIN_CHANGE_GROUP_C;
	}
	return PIN_CHANGE_NONE;
}

u8 resolvePinChangeBit(core_gpio::Pin pin) {
	return resolvePinBit(pin);
}

u16 subtractCap(u16 value, u16 subtrahend) {
	if (value > subtrahend) {
		return (u16)(value - subtrahend);
	}
	return 1;
}

void configureReceiveTiming(u16 bitDelay) {
	receiveCenteringDelay =
		subtractCap((u16)(bitDelay / CENTERING_DIVISOR),
					RX_CENTERING_OVERHEAD_LOOP_UNITS);
	receiveBitDelay = subtractCap(bitDelay, RX_BIT_OVERHEAD_LOOP_UNITS);
	receiveStopDelay =
		subtractCap((u16)((bitDelay * STOP_DIVISOR_NUMERATOR) / STOP_DIVISOR),
					RX_STOP_OVERHEAD_LOOP_UNITS);
}

u16 resolveBitDelayLoops(u32 baudRate) {
	if (baudRate < MINIMUM_BAUD_RATE || baudRate > MAXIMUM_BAUD_RATE) {
		return 0;
	}
	return (u16)((CYCLES_PER_SECOND / baudRate) / BIT_DELAY_CYCLE_DIVISOR);
}

u8 saveAndDisableInterrupts() {
	const u8 savedState = SREG;
	cli();
	return savedState;
}

void restoreInterruptState(u8 savedState) {
	SREG = savedState;
}

void resetReceiveBuffer() {
	const u8 savedState = saveAndDisableInterrupts();
	receiveHead = 0;
	receiveTail = 0;
	receiveCount = 0;
	receiveOverflowed = false;
	restoreInterruptState(savedState);
}

void setReceiveMask(boolean enabled) {
	const u8 group = resolvePinChangeGroup((core_gpio::Pin)activeReceivePin);

	if (group == PIN_CHANGE_NONE) {
		return;
	}

	const u8 bit = resolvePinChangeBit((core_gpio::Pin)activeReceivePin);
	const u8 mask = (u8)_BV(bit);

	if (enabled) {
		*PIN_CHANGE_MASK_REGISTERS[group] |= mask;
	} else {
		*PIN_CHANGE_MASK_REGISTERS[group] &= (u8)~mask;
	}
}

void releaseReceive() {
	if (activeReceivePin == NO_PIN) {
		return;
	}
	setReceiveMask(false);
	activeReceivePin = NO_PIN;
}

void configureTransmit(core_gpio::Pin pin) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);
	*port->output |= mask;
	*port->direction |= mask;
}

void releaseTransmit(core_gpio::Pin pin) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);
	*port->direction &= (u8)~mask;
	*port->output &= (u8)~mask;
}

void configureReceive(core_gpio::Pin pin) {
	const PortRegisters *port = resolvePort(pin);

	if (port == nullptr) {
		return;
	}

	const u8 mask = resolveBitMask(pin);
	*port->direction &= (u8)~mask;
	*port->output |= mask;
}
