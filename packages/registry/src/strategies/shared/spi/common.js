import { resolveEnumMemberFromPrefixes } from "../enum-member-resolution.js";

const ENUM_PREFIX_BY_MODULE = {
	SPI: "core_spi::SPI::SPI_",
	SpiBitOrder: "core_spi::",
	SpiClockMode: "core_spi::",
};

export const resolveEnumMember = (moduleName, memberName) => {
	return resolveEnumMemberFromPrefixes(
		ENUM_PREFIX_BY_MODULE,
		moduleName,
		memberName,
	);
};
