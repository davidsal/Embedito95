export const isInLocation = (line, column, location) => {
	if (!location?.start || !location?.end) {
		return false;
	}

	const { start, end } = location;

	if (line < start.line || line > end.line) {
		return false;
	}
	if (line === start.line && column < start.column) {
		return false;
	}
	if (line === end.line && column > end.column) {
		return false;
	}

	return true;
};
