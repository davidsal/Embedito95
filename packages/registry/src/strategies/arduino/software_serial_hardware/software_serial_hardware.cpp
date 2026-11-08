#include <avr/interrupt.h>
#include <avr/io.h>
#include <util/delay_basic.h>

#include <core_time.h>

#include "core_software_serial_hardware.h"

namespace core_software_serial_hardware {

namespace software_serial_detail {

_e95_replace_software_serial_pins
_e95_replace_software_serial_receive
_e95_replace_software_serial_transmit
_e95_replace_software_serial_stream

} // namespace software_serial_detail

_e95_replace_serialCommon

u8 getReceiveCapacity() {
	return RECEIVE_CAPACITY;
}

boolean isBaudRateSupported(u32 baudRate) {
	return software_serial_detail::resolveBitDelayLoops(baudRate) != 0;
}

boolean isReceivePin(core_gpio::Pin pin) {
	return (u8)pin < software_serial_detail::PIN_COUNT;
}

u8 getPinChangeGroup(core_gpio::Pin pin) {
	if (!isReceivePin(pin)) {
		return software_serial_detail::PIN_CHANGE_NONE;
	}
	return software_serial_detail::resolvePinChangeGroup(pin);
}

u8 getPinChangeBit(core_gpio::Pin pin) {
	if (!isReceivePin(pin)) {
		return software_serial_detail::PIN_CHANGE_NONE;
	}
	return software_serial_detail::resolvePinChangeBit(pin);
}

boolean openPort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin, u32 baudRate) {
	const u16 bitDelay = software_serial_detail::resolveBitDelayLoops(baudRate);
	const boolean hasTransmitPin =
		(u8)transmitPin < software_serial_detail::PIN_COUNT;
	const boolean hasReceivePin = isReceivePin(receivePin);

	if (bitDelay == 0 || (!hasTransmitPin && !hasReceivePin)) {
		return false;
	}

	if (hasTransmitPin) {
		software_serial_detail::bitDelayByPin[(u8)transmitPin] = bitDelay;
		software_serial_detail::configureTransmit(transmitPin);
	}

	if (hasReceivePin) {
		software_serial_detail::bitDelayByPin[(u8)receivePin] = bitDelay;
		software_serial_detail::configureReceive(receivePin);
	}

	return true;
}

void closePort(core_gpio::Pin transmitPin, core_gpio::Pin receivePin) {
	const u8 transmitNumber = (u8)transmitPin;
	const u8 receiveNumber = (u8)receivePin;

	if (transmitNumber < software_serial_detail::PIN_COUNT &&
		software_serial_detail::bitDelayByPin[transmitNumber] != 0) {
		software_serial_detail::releaseTransmit(transmitPin);
		software_serial_detail::bitDelayByPin[transmitNumber] = 0;
	}

	if (!isReceivePin(receivePin)) {
		return;
	}

	if (software_serial_detail::activeReceivePin == receiveNumber) {
		software_serial_detail::releaseReceive();
		software_serial_detail::resetReceiveBuffer();
	}

	// The receive timing is stored per pin, and another handle may still own
	// the same receive pin, so closing one handle does not clear it. `initialize`
	// always rewrites the timing before a handle starts listening again.
}

void startReceive(core_gpio::Pin receivePin) {
	if (!isReceivePin(receivePin)) {
		return;
	}

	const u8 receiveNumber = (u8)receivePin;
	const u16 bitDelay = software_serial_detail::bitDelayByPin[receiveNumber];

	if (bitDelay == 0) {
		return;
	}

	const u8 group = software_serial_detail::resolvePinChangeGroup(receivePin);
	const u8 enableBit =
		software_serial_detail::PIN_CHANGE_ENABLE_BITS[group];

	if (software_serial_detail::activeReceivePin == receiveNumber) {
		software_serial_detail::resetReceiveBuffer();
		software_serial_detail::configureReceiveTiming(bitDelay);
		PCIFR = (u8)_BV(group);
		software_serial_detail::setReceiveMask(true);
		return;
	}

	software_serial_detail::releaseReceive();
	software_serial_detail::activeReceivePin = receiveNumber;
	software_serial_detail::configureReceiveTiming(bitDelay);
	software_serial_detail::resetReceiveBuffer();

	PCICR |= (u8)_BV(enableBit);
	PCIFR = (u8)_BV(group);
	software_serial_detail::setReceiveMask(true);
}

void stopReceive(core_gpio::Pin receivePin) {
	if (software_serial_detail::activeReceivePin != (u8)receivePin) {
		return;
	}
	software_serial_detail::releaseReceive();
}

boolean isReceiving(core_gpio::Pin receivePin) {
	return software_serial_detail::activeReceivePin == (u8)receivePin;
}

void sendByte(core_gpio::Pin transmitPin, u8 value) {
	software_serial_detail::transmitByte(transmitPin, value);
}

boolean hasBufferedData() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result = software_serial_detail::receiveCount > 0;
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

u8 readBufferedByte() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();

	if (software_serial_detail::receiveCount == 0) {
		software_serial_detail::restoreInterruptState(savedState);
		return 0;
	}

	const u8 value =
		software_serial_detail::receiveBuffer[software_serial_detail::receiveHead];
	software_serial_detail::receiveHead =
		(u8)((software_serial_detail::receiveHead + 1) % RECEIVE_CAPACITY);
	software_serial_detail::receiveCount--;
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

u8 peekBufferedByte() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();

	if (software_serial_detail::receiveCount == 0) {
		software_serial_detail::restoreInterruptState(savedState);
		return 0;
	}

	const u8 value =
		software_serial_detail::receiveBuffer[software_serial_detail::receiveHead];
	software_serial_detail::restoreInterruptState(savedState);
	return value;
}

boolean hasReceiveOverflow() {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();
	const boolean result = software_serial_detail::receiveOverflowed;
	software_serial_detail::restoreInterruptState(savedState);
	return result;
}

void storeReceivedByte(u8 value) {
	const u8 savedState = software_serial_detail::saveAndDisableInterrupts();

	if (software_serial_detail::receiveCount == RECEIVE_CAPACITY) {
		software_serial_detail::receiveHead =
			(u8)((software_serial_detail::receiveHead + 1) % RECEIVE_CAPACITY);
		software_serial_detail::receiveCount--;
		software_serial_detail::receiveOverflowed = true;
	}

	software_serial_detail::receiveBuffer[software_serial_detail::receiveTail] = value;
	software_serial_detail::receiveTail =
		(u8)((software_serial_detail::receiveTail + 1) % RECEIVE_CAPACITY);
	software_serial_detail::receiveCount++;
	software_serial_detail::restoreInterruptState(savedState);
}

core_string::String readStreamLine() {
	software_serial_detail::BufferedReceivePort port;
	core_string::String line;
	serial_detail::readLineInto(
		port,
		line,
		serial_detail::READ_TIMEOUT_MILLIS,
		&core_time::getMillis,
		serial_detail::NEWLINE_CHARACTER);
	return line;
}

i32 readStreamInteger() {
	software_serial_detail::BufferedReceivePort port;
	return serial_detail::readIntegerFrom(
		port,
		serial_detail::READ_TIMEOUT_MILLIS,
		&core_time::getMillis);
}

} // namespace core_software_serial_hardware

ISR(PCINT0_vect) {
	core_software_serial_hardware::software_serial_detail::handlePinChangeInterrupt(
		core_software_serial_hardware::software_serial_detail::PIN_CHANGE_GROUP_B);
}

ISR(PCINT1_vect) {
	core_software_serial_hardware::software_serial_detail::handlePinChangeInterrupt(
		core_software_serial_hardware::software_serial_detail::PIN_CHANGE_GROUP_C);
}

ISR(PCINT2_vect) {
	core_software_serial_hardware::software_serial_detail::handlePinChangeInterrupt(
		core_software_serial_hardware::software_serial_detail::PIN_CHANGE_GROUP_D);
}
