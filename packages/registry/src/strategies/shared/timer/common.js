import { resolveEnumMemberFromPrefixes } from "../enum-member-resolution.js";

const ENUM_PREFIX_BY_MODULE = {
	Timer: "core_timer::Timer::TIMER_",
};

export const resolveEnumMember = (moduleName, memberName) => {
	return resolveEnumMemberFromPrefixes(
		ENUM_PREFIX_BY_MODULE,
		moduleName,
		memberName,
	);
};
