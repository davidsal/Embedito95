import { runEnumPostInstall } from "../enum-post-install.js";

const SPI_MARKER = "// e95.postinstall.spiEnum";

export const run = (projectDir, platform) => {
	runEnumPostInstall({
		projectDir,
		platform,
		platformKey: "spi",
		marker: SPI_MARKER,
		relativePath: "core/spi/main.e95",
	});
};
