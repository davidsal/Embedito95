import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export const CLI_DIRECTORY = join(SHARED_DIRECTORY, "../../..");

export const getCurrentWorkingDirectory = () => {
	return process.env.INIT_CWD || process.cwd();
};
