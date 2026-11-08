import { runEnumPostInstall } from "../enum-post-install.js";

const TIMER_MARKER = "// e95.postinstall.timerEnum";

const isEntrySelectable = (entry) => {
	return !entry.reservedByMillis;
};

export const run = (projectDir, platform) => {
	runEnumPostInstall({
		projectDir,
		platform,
		platformKey: "timers",
		marker: TIMER_MARKER,
		relativePath: "core/timer/main.e95",
		isEntrySelectable,
	});
};
