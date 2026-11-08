const wrapSetupLoopEntry = (mainBody, indentBlock) => {
	const body = indentBlock(mainBody);

	return `void setup() {\n${body ? `${body}\n` : ""}}\n\nvoid loop() {\n}\n`;
};

const wrapMainEntry = (mainBody, indentBlock) => {
	const body = indentBlock(mainBody);

	return `int main() {\n${body ? `${body}\n` : ""}}\n`;
};

export const MAIN_ENTRY_SETUP_LOOP = "setup/loop";
export const MAIN_ENTRY_MAIN = "int main";

export const mainEntryGenerators = {
	[MAIN_ENTRY_SETUP_LOOP]: wrapSetupLoopEntry,
	[MAIN_ENTRY_MAIN]: wrapMainEntry,
};

export const resolveMainEntryGenerator = (mainEntry) => {
	const generator = mainEntryGenerators[mainEntry];

	if (!generator) {
		throw new Error(`Unknown main entry style "${mainEntry}"`);
	}

	return generator;
};
