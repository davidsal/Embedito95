namespace i2c_detail {

// The interrupt vector receives no bus argument, and only one bus can listen
// as a slave at a time, so the most recently configured bus owns the dispatch.
static I2CBusBody *activeSlaveBody = nullptr;
// The handle is kept beside the body so a newly configured bus can release the
// previous one without dereferencing its body after it goes out of scope.
static I2C_TypeDef *activeSlaveHandle = nullptr;

static void setActiveSlave(I2CBusBody *body) {
	activeSlaveBody = body;
	activeSlaveHandle = body->handle;
}

static void clearActiveSlave() {
	activeSlaveBody = nullptr;
	activeSlaveHandle = nullptr;
}

static void resetSlaveTransaction(I2CBusBody *body) {
	body->responseLength = 0;
	body->responseIndex = 0;
	body->requestActive = false;
	body->slaveTransmitter = false;
}

static I2CBusBody *findActiveSlave(I2C_TypeDef *handle) {
	if (activeSlaveBody == nullptr || activeSlaveHandle != handle) {
		return nullptr;
	}
	return activeSlaveBody;
}

static void disableSlaveInterrupts(I2C_TypeDef *handle) {
	const I2CConfig *config = findI2CConfig(handle);
	LL_I2C_DisableIT_EVT(handle);
	LL_I2C_DisableIT_BUF(handle);
	LL_I2C_DisableIT_ERR(handle);
	if (config != nullptr) {
		NVIC_DisableIRQ(config->eventInterrupt);
		NVIC_DisableIRQ(config->errorInterrupt);
	}
}

// Releases the peripheral as well as the interrupts so a bus that is handed
// over stops acknowledging its own address instead of only going quiet.
static void stopSlavePeripheral(I2C_TypeDef *handle) {
	disableSlaveInterrupts(handle);
	LL_I2C_Disable(handle);
}

static void handleSlaveAddress(I2CBusBody *body) {
	I2C_TypeDef *handle = body->handle;
	const bool slaveTransmits =
		LL_I2C_GetTransferDirection(handle) == LL_I2C_DIRECTION_WRITE;

	LL_I2C_ClearFlag_ADDR(handle);
	LL_I2C_AcknowledgeNextData(handle, LL_I2C_ACK);

	if (slaveTransmits) {
		body->slaveTransmitter = true;
		body->receiveActive = false;
		body->responseLength = 0;
		body->responseIndex = 0;
		body->requestActive = true;
		if (body->requestHandler != nullptr) {
			body->requestHandler();
		}
		body->requestActive = false;
		LL_I2C_EnableIT_TX(handle);
		return;
	}

	body->slaveTransmitter = false;
	body->receiveActive = true;
	body->readBuffer.truncate(I2C_EMPTY_BYTE);
	body->readIndex = 0;
	body->readBuffer.reserve(i2c_detail::TRANSACTION_CAPACITY);
	LL_I2C_EnableIT_BUF(handle);
}

static void handleSlaveReceiveByte(I2CBusBody *body) {
	const u8 value = LL_I2C_ReceiveData8(body->handle);
	if (body->readBuffer.length() < i2c_detail::TRANSACTION_CAPACITY) {
		body->readBuffer.push(value);
	}
}

// The master owns the read length, so the slave cannot end the transfer with
// its own NACK: clearing ACK here would NACK the next address and leaving DR
// unwritten would stall the clock. Keep ACK asserted and feed a defined filler
// once the response runs out, until the master NACKs or generates the stop.
static void handleSlaveTransmitByte(I2CBusBody *body) {
	if (!body->slaveTransmitter) {
		return;
	}
	if (body->responseIndex < body->responseLength) {
		LL_I2C_TransmitData8(
			body->handle,
			body->responseBuffer[body->responseIndex]);
		body->responseIndex = body->responseIndex + 1;
		return;
	}
	LL_I2C_TransmitData8(body->handle, I2C_TX_FILLER_BYTE);
}

static void handleSlaveStop(I2CBusBody *body) {
	LL_I2C_ClearFlag_STOP(body->handle);
	const bool wasReceiving = body->receiveActive;
	body->receiveActive = false;
	resetSlaveTransaction(body);
	if (wasReceiving && body->receiveHandler != nullptr) {
		body->receiveHandler();
	}
}

void handleEventInterrupt(I2C_TypeDef *handle) {
	I2CBusBody *body = findActiveSlave(handle);
	if (body == nullptr) {
		return;
	}
	// A byte can still be latched in DR when the stop arrives, so drain the data
	// registers before resetting the transaction on STOPF.
	if (LL_I2C_IsActiveFlag_ADDR(handle)) {
		handleSlaveAddress(body);
	}
	if (LL_I2C_IsActiveFlag_RXNE(handle)) {
		handleSlaveReceiveByte(body);
	}
	if (LL_I2C_IsActiveFlag_TXE(handle)) {
		handleSlaveTransmitByte(body);
	}
	if (LL_I2C_IsActiveFlag_STOP(handle)) {
		handleSlaveStop(body);
	}
}

void handleErrorInterrupt(I2C_TypeDef *handle) {
	if (LL_I2C_IsActiveFlag_BERR(handle)) {
		LL_I2C_ClearFlag_BERR(handle);
	}
	if (LL_I2C_IsActiveFlag_ARLO(handle)) {
		LL_I2C_ClearFlag_ARLO(handle);
	}
	if (LL_I2C_IsActiveFlag_OVR(handle)) {
		LL_I2C_ClearFlag_OVR(handle);
	}
	if (LL_I2C_IsActiveFlag_AF(handle)) {
		LL_I2C_ClearFlag_AF(handle);
	}
	LL_I2C_DisableIT_BUF(handle);
	I2CBusBody *body = findActiveSlave(handle);
	if (body != nullptr) {
		resetSlaveTransaction(body);
	}
}

} // namespace i2c_detail
