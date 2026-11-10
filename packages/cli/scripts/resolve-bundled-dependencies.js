import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { UTF8 } from "embedito95-core";
import { CLI_DIRECTORY } from "../src/commands/shared/paths.js";
import { PACKAGE_FILE } from "../src/constants.js";

const REPOSITORY_ROOT = join(CLI_DIRECTORY, "..", "..");
const PACKAGES_DIRECTORY = join(REPOSITORY_ROOT, "packages");
const BACKUP_FILE = join(CLI_DIRECTORY, ".bundled-dependencies-backup.json");
const WORKSPACE_PROTOCOL = "workspace:";
const DEPENDENCY_FIELDS = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
];

const readJson = (path) => {
	return JSON.parse(readFileSync(path, UTF8));
};

const writeJson = (path, value) => {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, UTF8);
};

const readWorkspacePackages = () => {
	const packages = new Map();

	for (const entry of readdirSync(PACKAGES_DIRECTORY)) {
		const path = join(PACKAGES_DIRECTORY, entry, PACKAGE_FILE);

		if (!existsSync(path)) {
			continue;
		}

		const configuration = readJson(path);
		packages.set(configuration.name, {
			path,
			version: configuration.version,
			configuration,
		});
	}

	return packages;
};

const resolveWorkspaceRange = (range, version) => {
	const requested = range.slice(WORKSPACE_PROTOCOL.length);

	if (requested === "" || requested === "*") {
		return version;
	}

	if (requested === "^") {
		return `^${version}`;
	}

	if (requested === "~") {
		return `~${version}`;
	}

	return requested;
};

const restoreManifests = () => {
	if (!existsSync(BACKUP_FILE)) {
		return;
	}

	const backups = readJson(BACKUP_FILE);

	for (const [path, content] of Object.entries(backups)) {
		writeFileSync(path, content, UTF8);
	}

	rmSync(BACKUP_FILE, { force: true });
	console.log("Restored bundled dependency manifests");
};

if (process.argv.includes("--restore")) {
	restoreManifests();
	process.exit(0);
}

const workspacePackages = readWorkspacePackages();
const cliConfiguration = readJson(join(CLI_DIRECTORY, PACKAGE_FILE));
const bundledDependencies =
	cliConfiguration.bundledDependencies ??
	cliConfiguration.bundleDependencies ??
	[];
const backups = {};
let changed = false;

for (const name of bundledDependencies) {
	const target = workspacePackages.get(name);

	if (!target) {
		continue;
	}

	let targetChanged = false;

	for (const field of DEPENDENCY_FIELDS) {
		for (const [dependencyName, range] of Object.entries(
			target.configuration[field] ?? {},
		)) {
			if (!range.startsWith(WORKSPACE_PROTOCOL)) {
				continue;
			}

			const dependency = workspacePackages.get(dependencyName);

			if (!dependency) {
				throw new Error(
					`Cannot resolve ${dependencyName} while bundling ${name}`,
				);
			}

			target.configuration[field][dependencyName] = resolveWorkspaceRange(
				range,
				dependency.version,
			);
			targetChanged = true;
		}
	}

	if (targetChanged) {
		backups[target.path] = readFileSync(target.path, UTF8);
		writeJson(target.path, target.configuration);
		changed = true;
	}
}

writeJson(BACKUP_FILE, backups);

console.log(
	changed
		? "Resolved workspace protocols in bundled dependency manifests"
		: "No workspace protocols found in bundled dependency manifests",
);
