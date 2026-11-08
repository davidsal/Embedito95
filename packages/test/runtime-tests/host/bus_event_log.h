#ifndef _E95_RUNTIME_HOST_BUS_EVENT_LOG_H
#define _E95_RUNTIME_HOST_BUS_EVENT_LOG_H
// Ordered event log shared by the I2C/SPI host doubles. Digital pin changes and
// bus writes land in the same sequence, so a runtime test can assert not only
// that a write happened but that it happened while chip select was low and
// before it was driven high again.
#include <Arduino.h>
#include <core_array.h>
#include <stdint.h>

namespace bus_event_log {

inline constexpr u16 EVENT_CAPACITY = 512;
inline constexpr u16 PAYLOAD_CAPACITY = 64;
inline constexpr u8 NO_PIN = 255;
inline constexpr u8 NO_ADDRESS = 255;

typedef enum : u8 {
	DIGITAL_EVENT = 0,
	BUS_EVENT = 1
} EventKind;

struct Event {
	EventKind kind;
	u8 pin;
	u8 level;
	u8 address;
	u16 payloadLength;
	u8 payload[PAYLOAD_CAPACITY];

	Event()
		: kind(DIGITAL_EVENT)
		, pin(NO_PIN)
		, level(0)
		, address(NO_ADDRESS)
		, payloadLength(0)
		, payload() {}
};

inline Event events[EVENT_CAPACITY];
inline u16 eventCount = 0;

inline void reset() {
	eventCount = 0;
}

inline Event &appendEvent(EventKind kind) {
	// The tests reset the log per scenario and stay well below the capacity, so
	// saturating at the last slot is only a guard against silent overruns.
	if (eventCount >= EVENT_CAPACITY) {
		events[EVENT_CAPACITY - 1] = Event();
		events[EVENT_CAPACITY - 1].kind = kind;
		return events[EVENT_CAPACITY - 1];
	}
	Event &event = events[eventCount];
	event = Event();
	event.kind = kind;
	eventCount++;
	return event;
}

inline void recordDigitalWrite(u8 pin, u8 level) {
	Event &event = appendEvent(DIGITAL_EVENT);
	event.pin = pin;
	event.level = level;
}

inline void recordBusWrite(u8 address, const core_array::Array<u8> &payload) {
	Event &event = appendEvent(BUS_EVENT);
	event.address = address;
	event.payloadLength = payload.length();
	for (u16 index = 0; index < payload.length() && index < PAYLOAD_CAPACITY; index++) {
		event.payload[index] = payload[index];
	}
}

} // namespace bus_event_log

#endif
