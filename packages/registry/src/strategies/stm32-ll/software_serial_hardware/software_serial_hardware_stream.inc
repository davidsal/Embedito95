namespace software_serial_detail {

// Adapts the receive ring buffer to the shared `serial_detail` stream helpers.
// Each read takes the driver's critical section, so the timer interrupt cannot
// change the buffer between the empty check and the byte removal.
struct BufferedReceivePort {
	boolean hasData() const {
		return core_software_serial_hardware::hasBufferedData();
	}

	nullable<u8> read() const {
		nullable<u8> result;
		result.isNull = !core_software_serial_hardware::hasBufferedData();
		result.value = result.isNull ? 0 : core_software_serial_hardware::readBufferedByte();
		return result;
	}
};

} // namespace software_serial_detail
