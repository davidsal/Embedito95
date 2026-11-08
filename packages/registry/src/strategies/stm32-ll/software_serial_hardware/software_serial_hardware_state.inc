namespace software_serial_detail {

// Shared receive buffer and 3x-oversampled receive state machine. This
// fragment is self-contained (only the platform integer typedefs) so the host
// runtime test can compile and exercise it without any STM32 register. The
// generated driver injects it once inside its translation unit.

const u8 DATA_BIT_COUNT = 8;
const u8 OVERSAMPLE_FACTOR = 3;
// The timer fires OVERSAMPLE_FACTOR times per bit, so waiting one bit plus one
// extra tick after the start edge lands the first sample in the middle of the
// first data bit instead of on the edge itself.
const u8 START_CENTERING_TICKS = OVERSAMPLE_FACTOR + 1;
const u8 RECEIVE_CAPACITY = 64;
const u8 NO_PIN = 0xFF;
const i8 WAITING_START_BIT_INDEX = -1;
const i8 STOP_BIT_INDEX = DATA_BIT_COUNT;
const u8 MOST_SIGNIFICANT_BIT = 0x80;
const u8 TICK_WAITING_FOR_START = 1;

struct ReceiveBuffer {
	volatile u8 storage[RECEIVE_CAPACITY];
	volatile u8 head;
	volatile u8 tail;
	volatile u8 count;
	volatile boolean overflowed;
};

struct ReceiveState {
	volatile i16 tickCountdown;
	volatile i8 bitIndex;
	volatile u8 value;
};

void resetReceiveBuffer(volatile ReceiveBuffer &buffer) {
	buffer.head = 0;
	buffer.tail = 0;
	buffer.count = 0;
	buffer.overflowed = false;
}

void storeByte(volatile ReceiveBuffer &buffer, u8 value) {
	if (buffer.count == RECEIVE_CAPACITY) {
		buffer.head = (u8)((buffer.head + 1) % RECEIVE_CAPACITY);
		buffer.count--;
		buffer.overflowed = true;
	}
	buffer.storage[buffer.tail] = value;
	buffer.tail = (u8)((buffer.tail + 1) % RECEIVE_CAPACITY);
	buffer.count++;
}

boolean hasBufferedByte(const volatile ReceiveBuffer &buffer) {
	return buffer.count > 0;
}

u8 readBufferedByte(volatile ReceiveBuffer &buffer) {
	if (buffer.count == 0) {
		return 0;
	}
	const u8 value = buffer.storage[buffer.head];
	buffer.head = (u8)((buffer.head + 1) % RECEIVE_CAPACITY);
	buffer.count--;
	return value;
}

u8 peekBufferedByte(const volatile ReceiveBuffer &buffer) {
	if (buffer.count == 0) {
		return 0;
	}
	return buffer.storage[buffer.head];
}

boolean hasOverflowed(const volatile ReceiveBuffer &buffer) {
	return buffer.overflowed;
}

void resetReceiveState(volatile ReceiveState &state) {
	state.tickCountdown = TICK_WAITING_FOR_START;
	state.bitIndex = WAITING_START_BIT_INDEX;
	state.value = 0;
}

// Runs one timer tick. The update interrupt fires OVERSAMPLE_FACTOR times per
// bit, so this function discards ticks until the countdown reaches zero and
// only then samples the line. A low start bit begins a frame; each data bit is
// shifted in least significant first; a high stop bit commits the byte and a
// low stop bit discards the malformed frame.
void processReceiveTick(
	volatile ReceiveState &state,
	volatile ReceiveBuffer &buffer,
	boolean lineHigh) {
	state.tickCountdown--;
	if (state.tickCountdown > 0) {
		return;
	}

	if (state.bitIndex == WAITING_START_BIT_INDEX) {
		if (lineHigh) {
			state.tickCountdown = TICK_WAITING_FOR_START;
			return;
		}
		state.bitIndex = 0;
		state.value = 0;
		state.tickCountdown = START_CENTERING_TICKS;
		return;
	}

	if (state.bitIndex >= STOP_BIT_INDEX) {
		if (lineHigh) {
			storeByte(buffer, state.value);
		}
		state.bitIndex = WAITING_START_BIT_INDEX;
		state.tickCountdown = TICK_WAITING_FOR_START;
		return;
	}

	state.value >>= 1;
	if (lineHigh) {
		state.value |= MOST_SIGNIFICANT_BIT;
	}
	state.bitIndex++;
	state.tickCountdown = OVERSAMPLE_FACTOR;
}

} // namespace software_serial_detail
