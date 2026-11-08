const RANGE_I8 = { min: -128, max: 127 };
const RANGE_U8 = { min: 0, max: 255 };
const RANGE_I16 = { min: -32768, max: 32767 };
const RANGE_U16 = { min: 0, max: 65535 };
const RANGE_I32 = { min: -2147483648, max: 2147483647 };
const RANGE_U32 = { min: 0, max: 4294967295 };

const TYPE_U8 = "u8";
const TYPE_I8 = "i8";
const TYPE_U16 = "u16";
const TYPE_I16 = "i16";
const TYPE_U32 = "u32";
const TYPE_I32 = "i32";
const TYPE_I64 = "i64";
const TYPE_U64 = "u64";

export const resolveIntegerType = (min, max, preferSigned = false) => {
	if (min < 0) {
		const limit = Math.max(Math.abs(min), Math.abs(max));

		if (limit <= -RANGE_I8.min) {
			return TYPE_I8;
		}
		if (limit <= -RANGE_I16.min) {
			return TYPE_I16;
		}
		if (limit <= -RANGE_I32.min) {
			return TYPE_I32;
		}
		return TYPE_I64;
	}

	if (preferSigned) {
		if (max <= RANGE_I8.max) {
			return TYPE_I8;
		}
		if (max <= RANGE_U8.max) {
			return TYPE_U8;
		}
		if (max <= RANGE_I16.max) {
			return TYPE_I16;
		}
		if (max <= RANGE_U16.max) {
			return TYPE_U16;
		}
		if (max <= RANGE_I32.max) {
			return TYPE_I32;
		}
		if (max <= RANGE_U32.max) {
			return TYPE_U32;
		}
		return TYPE_I64;
	}

	if (max <= RANGE_U8.max) {
		return TYPE_U8;
	}
	if (max <= RANGE_U16.max) {
		return TYPE_U16;
	}
	if (max <= RANGE_U32.max) {
		return TYPE_U32;
	}
	return TYPE_U64;
};
