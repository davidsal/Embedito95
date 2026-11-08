struct BufferedReceivePort {
	boolean hasData() const {
		return hasBufferedData();
	}

	nullable<u8> read() const {
		nullable<u8> result;
		result.isNull = !hasBufferedData();
		result.value = result.isNull ? 0 : readBufferedByte();
		return result;
	}
};
