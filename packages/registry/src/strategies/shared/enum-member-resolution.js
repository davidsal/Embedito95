export const resolveEnumMemberFromPrefixes = (
	prefixByModule,
	moduleName,
	memberName,
) => {
	const prefix = prefixByModule[moduleName];

	if (!prefix) {
		return null;
	}

	return `${prefix}${memberName}`;
};
