import { runEnumPostInstall } from "../enum-post-install.js";

const SERIAL_MARKER = "// e95.postinstall.serialEnum";

export const run = (projectDir, platform) => {
	runEnumPostInstall({
		projectDir,
		platform,
		platformKey: "serial",
		marker: SERIAL_MARKER,
		relativePath: "core/serial/main.e95",
	});
};
