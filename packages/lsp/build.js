import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const PLATFORMS_DIRECTORY = dirname(
	require.resolve("embedito95-registry/platforms"),
);
const PLATFORMS_IMPORT = "embedito95-registry/platforms";
const PLATFORMS_NAMESPACE = "e95-platforms";

const platformEntriesPlugin = {
	name: "bundle-registry-platforms",
	setup(build) {
		build.onResolve({ filter: /^embedito95-registry\/platforms$/ }, () => {
			return { path: PLATFORMS_IMPORT, namespace: PLATFORMS_NAMESPACE };
		});

		build.onLoad({ filter: /.*/, namespace: PLATFORMS_NAMESPACE }, () => {
			const platformFiles = readdirSync(PLATFORMS_DIRECTORY)
				.filter(
					(fileName) =>
						fileName.endsWith(".js") &&
						fileName !== "index.js" &&
						fileName !== "enums.js",
				)
				.sort();

			const importLines = [];
			const names = [];

			for (const fileName of platformFiles) {
				const name = `platform_${fileName.replace(/[^A-Za-z0-9_]/g, "_")}`;
				importLines.push(
					`import { platform as ${name} } from ${JSON.stringify(
						`${PLATFORMS_DIRECTORY}/${fileName}`,
					)};`,
				);
				names.push(name);
			}

			return {
				contents: `${importLines.join("\n")}\nexport const platforms = [${names.join(", ")}];\n`,
				loader: "js",
				resolveDir: PLATFORMS_DIRECTORY,
			};
		});
	},
};

await build({
	entryPoints: ["src/index.js"],
	outfile: "dist/server.cjs",
	bundle: true,
	platform: "node",
	format: "cjs",
	plugins: [platformEntriesPlugin],
	external: ["embedito95-registry/strategies"],
});
