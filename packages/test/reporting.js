import { relative } from "node:path";
import {
	GREEN_CHECK,
	RED_CROSS,
	SNAPSHOT_STATUS,
	TEST_SOURCES_DIRECTORY,
} from "./constants.js";

const countPassedChecks = (results) => {
	return results.filter((result) => {
		return result.status !== SNAPSHOT_STATUS.mismatch;
	}).length;
};

const formatGroupStatus = (groupName, results) => {
	const passed = countPassedChecks(results);
	const total = results.length;
	const hasFailures = passed !== total;
	const symbol = hasFailures ? RED_CROSS : GREEN_CHECK;
	const verdict = hasFailures ? "FAIL" : "PASS";
	return `> ${symbol} ${groupName}: ${verdict} ${passed}/${total}\n`;
};

export const printGroupStatus = (groupName, results) => {
	process.stdout.write(formatGroupStatus(groupName, results));

	for (const result of results) {
		if (result.status !== SNAPSHOT_STATUS.mismatch) {
			continue;
		}
		const snapshotLocation = relative(
			TEST_SOURCES_DIRECTORY,
			result.snapshotPath,
		);
		process.stderr.write(
			`${RED_CROSS} ${result.label} — snapshot mismatch: ${snapshotLocation}\n`,
		);
	}
};

export const expectEqual = (label, actual, expected) => {
	const status =
		actual === expected ? SNAPSHOT_STATUS.match : SNAPSHOT_STATUS.mismatch;
	return { label, status, actual, expected };
};

export const reportUnitChecks = (groupName, results) => {
	process.stdout.write(formatGroupStatus(groupName, results));

	for (const result of results) {
		if (result.status !== SNAPSHOT_STATUS.mismatch) {
			continue;
		}
		process.stderr.write(
			`${RED_CROSS} ${result.label} — expected ${JSON.stringify(result.expected)}, got ${JSON.stringify(result.actual)}\n`,
		);
	}
};
