import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSON_INDENTATION, UTF8 } from "embedito95-core";

const STATE_FILE = ".e95state.json";

const readState = (projectPath) => {
	const statePath = join(projectPath, STATE_FILE);
	if (!existsSync(statePath)) {
		return {};
	}
	try {
		return JSON.parse(readFileSync(statePath, UTF8));
	} catch {
		return {};
	}
};

const writeState = (projectPath, state) => {
	writeFileSync(
		join(projectPath, STATE_FILE),
		`${JSON.stringify(state, null, JSON_INDENTATION)}\n`,
		UTF8,
	);
};

export const loadProjectState = (projectPath) => {
	return readState(projectPath);
};

export const saveProjectState = (projectPath, updates) => {
	writeState(projectPath, { ...readState(projectPath), ...updates });
};
