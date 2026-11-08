#ifndef _E95_RUNTIME_HOST_WIRE_H
#define _E95_RUNTIME_HOST_WIRE_H
// Host stand-in for the AVR `Wire` library. It keeps the same 32-byte
// transmission buffer the real library has, records the address and payload of
// the last ended transmission, and lets a scenario force the status that
// `endTransmission()` returns so every I2CStatus path can be exercised without
// hardware.
#include <Arduino.h>
#include <stddef.h>
#include <stdint.h>

class TwoWire {
public:
	static const uint16_t BUFFER_CAPACITY = 32;
	typedef void (*ReceiveHandler)(int);
	typedef void (*RequestHandler)();

	uint8_t payload[BUFFER_CAPACITY] = {};
	uint16_t payloadLength = 0;
	uint16_t lastPayloadLength = 0;
	uint8_t lastPayload[BUFFER_CAPACITY] = {};
	uint8_t lastAddress = 0;
	uint16_t beginCount = 0;
	uint16_t endCount = 0;
	uint16_t writeCount = 0;
	uint16_t transmissionCount = 0;
	uint8_t nextStatus = 0;
	uint32_t clockFrequency = 0;

	uint8_t slaveAddress = 0;
	uint16_t slaveBeginCount = 0;
	ReceiveHandler receiveHandler = nullptr;
	RequestHandler requestHandler = nullptr;
	uint8_t receiveBuffer[BUFFER_CAPACITY] = {};
	uint16_t receiveLength = 0;
	uint16_t receiveIndex = 0;
	uint8_t responsePayload[BUFFER_CAPACITY] = {};
	uint16_t responseLength = 0;
	uint16_t responseWriteCount = 0;

	void begin() {}

	void begin(uint8_t address) {
		slaveAddress = address;
		slaveBeginCount++;
	}

	void end() { endCount++; }

	void setClock(uint32_t frequency) { clockFrequency = frequency; }

	void onReceive(ReceiveHandler handler) { receiveHandler = handler; }

	void onRequest(RequestHandler handler) { requestHandler = handler; }

	void simulateReceive(const uint8_t *data, uint16_t count) {
		receiveLength = 0;
		receiveIndex = 0;
		for (uint16_t index = 0; index < count && index < BUFFER_CAPACITY; index++) {
			receiveBuffer[index] = data[index];
			receiveLength++;
		}
		if (receiveHandler != nullptr) {
			receiveHandler((int)receiveLength);
		}
	}

	void simulateRequest() {
		responseLength = 0;
		responseWriteCount = 0;
		slaveRequestActive = true;
		if (requestHandler != nullptr) {
			requestHandler();
		}
		slaveRequestActive = false;
	}

	void beginTransmission(uint8_t address) {
		lastAddress = address;
		payloadLength = 0;
		transmissionActive = true;
		beginCount++;
	}

	size_t write(uint8_t value) {
		if (slaveRequestActive) {
			if (responseLength >= BUFFER_CAPACITY) {
				return 0;
			}
			responsePayload[responseLength] = value;
			responseLength++;
			responseWriteCount++;
			return 1;
		}
		writeCount++;
		if (!transmissionActive || payloadLength >= BUFFER_CAPACITY) {
			return 0;
		}
		payload[payloadLength] = value;
		payloadLength++;
		return 1;
	}

	uint8_t endTransmission() {
		transmissionCount++;
		lastPayloadLength = payloadLength;
		for (uint16_t index = 0; index < payloadLength; index++) {
			lastPayload[index] = payload[index];
		}
		transmissionActive = false;
		return nextStatus;
	}

	uint8_t requestFrom(uint8_t address, uint8_t quantity) {
		(void)address;
		(void)quantity;
		return 0;
	}

	int read() {
		if (receiveIndex >= receiveLength) {
			return -1;
		}
		const uint8_t value = receiveBuffer[receiveIndex];
		receiveIndex++;
		return value;
	}

	int available() { return (int)(receiveLength - receiveIndex); }

	void reset() {
		payloadLength = 0;
		lastPayloadLength = 0;
		lastAddress = 0;
		beginCount = 0;
		endCount = 0;
		writeCount = 0;
		transmissionCount = 0;
		nextStatus = 0;
		clockFrequency = 0;
		transmissionActive = false;
		slaveAddress = 0;
		slaveBeginCount = 0;
		receiveHandler = nullptr;
		requestHandler = nullptr;
		receiveLength = 0;
		receiveIndex = 0;
		responseLength = 0;
		responseWriteCount = 0;
		slaveRequestActive = false;
	}

private:
	bool transmissionActive = false;
	bool slaveRequestActive = false;
};

inline TwoWire Wire;

#endif
