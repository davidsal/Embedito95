import { runEnumPostInstall } from "../enum-post-install.js";

const I2C_MARKER = "// e95.postinstall.i2cEnum";

export const run = (projectDir, platform) => {
	runEnumPostInstall({
		projectDir,
		platform,
		platformKey: "i2c",
		marker: I2C_MARKER,
		relativePath: "core/i2c/main.e95",
	});
};
