export const resolvePlatformRenderOptions = (platform) => {
	const progmem = platform?.specs?.progmem === true;
	return {
		renderStringLiteral: (text) => {
			const rendered = JSON.stringify(decodeEscapes(text));
			return progmem && text ? `F(${rendered})` : rendered;
		},
		flashStrings: { progmem },
	};
};

export const decodeEscapes = (text) => {
	return text.replace(/\\(.)/gs, (match, char) => {
		switch (char) {
			case "n":
				return "\n";
			case "t":
				return "\t";
			case "r":
				return "\r";
			case "\\":
				return "\\";
			case '"':
				return '"';
			case "'":
				return "'";
			case "`":
				return "`";
			default:
				return match;
		}
	});
};
