import { stdin } from "node:process";
import {
	bold,
	clearLine,
	cyan,
	dim,
	hideCursor,
	moveUp,
	readKey,
	readLine,
	setRawMode,
	showCursor,
	write,
} from "../../console.js";
import {
	ARROW_DOWN_SEQUENCE,
	ARROW_UP_SEQUENCE,
	BACKSPACE,
	BACKSPACE_WINDOWS,
	CTRL_C,
	ENTER,
	ESCAPE,
} from "../../constants.js";

const navigateIndex = async ({
	defaultIndex,
	total,
	drawOptions,
	onCancel,
}) => {
	let currentIndex = defaultIndex;

	while (true) {
		const key = await readKey();

		if (key === CTRL_C || key === ESCAPE) {
			onCancel();
			process.exit(0);
		}

		if (key === ENTER) {
			return currentIndex;
		}

		if (key === ARROW_UP_SEQUENCE && currentIndex > 0) {
			currentIndex--;
			moveUp(total);
			drawOptions(currentIndex);
		}

		if (key === ARROW_DOWN_SEQUENCE && currentIndex < total - 1) {
			currentIndex++;
			moveUp(total);
			drawOptions(currentIndex);
		}
	}
};

const drawOptions = ({ total, choices, selectedIndex }) => {
	for (let optionIndex = 0; optionIndex < total; optionIndex++) {
		clearLine();
		const prefix = optionIndex === selectedIndex ? cyan("▸") : " ";
		const label =
			optionIndex === selectedIndex
				? cyan(choices[optionIndex].name)
				: dim(choices[optionIndex].name);
		write(` ${prefix} ${label}\n`);
	}
};

const removeOptions = (total) => {
	moveUp(total);
	for (let optionIndex = 0; optionIndex < total; optionIndex++) {
		clearLine();
		if (optionIndex < total - 1) {
			write("\n");
		}
	}
	moveUp(total);
};

const readInputValue = async () => {
	let value = "";

	while (true) {
		const key = await readKey();

		if (key === CTRL_C) {
			write("\n");
			showCursor();
			setRawMode(false);
			process.exit(0);
		}

		if (key === ENTER) {
			return value;
		}

		if (key === BACKSPACE || key === BACKSPACE_WINDOWS) {
			if (value.length > 0) {
				value = value.slice(0, -1);
				write("\b \b");
			}
			continue;
		}

		if (key.length === 1 && key >= " ") {
			value += key;
			write(key);
		}
	}
};

export const confirm = async ({ message, default: defaultValue = false }) => {
	return select({
		message,
		choices: [
			{ name: "Yes", value: true },
			{ name: "No", value: false },
		],
		defaultIndex: defaultValue ? 0 : 1,
	});
};

export const input = async ({ message }) => {
	if (!stdin.isTTY) {
		return readLine();
	}

	setRawMode(true);

	write(`${bold("?")} ${bold(message)} `);

	const value = await readInputValue();

	clearLine();
	write(`${cyan("✔")} ${bold(message)} ${value}\n`);
	showCursor();
	setRawMode(false);

	return value;
};

export const select = async ({ message, choices, defaultIndex = 0 }) => {
	if (!stdin.isTTY) {
		return choices[defaultIndex]?.value ?? choices[0].value;
	}

	setRawMode(true);
	hideCursor();

	const total = choices.length;

	write(`${bold("?")} ${bold(message)}\n`);
	drawOptions({ total, choices, selectedIndex: defaultIndex });

	const selectedIndex = await navigateIndex({
		defaultIndex,
		total,
		drawOptions: (currentIndex) => {
			drawOptions({ total, choices, selectedIndex: currentIndex });
		},
		onCancel: () => {
			removeOptions(total);
			showCursor();
			setRawMode(false);
		},
	});

	removeOptions(total);
	write(`${cyan("✔")} ${bold(message)} ${cyan(choices[selectedIndex].name)}\n`);
	showCursor();
	setRawMode(false);

	return choices[selectedIndex].value;
};
