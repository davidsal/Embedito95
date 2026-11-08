import { resolveEnumMemberFromPrefixes } from "../enum-member-resolution.js";

const ENUM_PREFIX_BY_MODULE = {
	I2C: "core_i2c::I2C::I2C_",
};

export const resolveEnumMember = (moduleName, memberName) => {
	return resolveEnumMemberFromPrefixes(
		ENUM_PREFIX_BY_MODULE,
		moduleName,
		memberName,
	);
};
