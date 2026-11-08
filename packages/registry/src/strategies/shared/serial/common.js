import { resolveEnumMemberFromPrefixes } from "../enum-member-resolution.js";

const ENUM_PREFIX_BY_MODULE = {
	Serial: "core_serial::Serial::SERIAL_",
};

export const resolveEnumMember = (moduleName, memberName) => {
	return resolveEnumMemberFromPrefixes(
		ENUM_PREFIX_BY_MODULE,
		moduleName,
		memberName,
	);
};
