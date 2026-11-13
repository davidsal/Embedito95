import { join } from "node:path";

export const ARTIFACTS_DIRECTORY_NAME = "artifacts";

export const resolveArtifactsDirectory = ({ outputDir }) => {
	return join(outputDir, ARTIFACTS_DIRECTORY_NAME);
};

export const resolveExecutablePath = ({ outputDir, projectName }) => {
	return join(resolveArtifactsDirectory({ outputDir }), projectName);
};
