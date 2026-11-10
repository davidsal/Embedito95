import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { UTF8 } from "embedito95-core";
import { runAsyncLocalChecks } from "./async-locals-checks.js";
import { runAsyncTaskTypeChecks } from "./async-task-type-checks.js";
import {
	listCategories,
	listEntryFiles,
	listPlatformNames,
	listTestDirectory,
	validatePlatformTestParity,
} from "./case-discovery.js";
import { runCliProjectChecks } from "./cli-project-checks.js";
import { runClosureFactoryChecks } from "./closure-factory-checks.js";
import {
	ASYNC_LOCAL_TYPES_UNIT_CHECKS_GROUP,
	ASYNC_TASK_TYPE_UNIT_CHECKS_GROUP,
	CLI_PROJECT_UNIT_CHECKS_GROUP,
	CLOSURE_FACTORY_UNIT_CHECKS_GROUP,
	CORE_SURFACE_UNIT_CHECKS_GROUP,
	FORMATTER_COPIES_DIRECTORY_NAME,
	FORMATTER_DIRECTORY_NAME,
	GREEN_CHECK,
	LANGUAGE_DIRECTORY_NAME,
	LINT_POLICY_UNIT_CHECKS_GROUP,
	LSP_COMPLETION_UNIT_CHECKS_GROUP,
	LSP_DIAGNOSTICS_UNIT_CHECKS_GROUP,
	LSP_HOVER_UNIT_CHECKS_GROUP,
	MONITOR_STATE_UNIT_CHECKS_GROUP,
	RED_CROSS,
	REGISTRY_CORE_PARITY_UNIT_CHECKS_GROUP,
	REGISTRY_DOC_COMMENT_UNIT_CHECKS_GROUP,
	REGISTRY_ENUM_RESOLUTION_UNIT_CHECKS_GROUP,
	REGISTRY_INT_TYPE_PARITY_UNIT_CHECKS_GROUP,
	REGISTRY_INT128_NEGATION_UNIT_CHECKS_GROUP,
	REGISTRY_POST_INSTALL_UNIT_CHECKS_GROUP,
	REGISTRY_STM32_PARALLEL_COMPILE_UNIT_CHECKS_GROUP,
	SHARED_CONSTANTS_UNIT_CHECKS_GROUP,
	SNAPSHOT_DIRECTORY_NAME,
	SNAPSHOT_STATUS,
	SNAPSHOT_TEMP_DIRECTORY_PREFIX,
	STM32_CUBEIDE_UNIT_CHECKS_GROUP,
	STM32_DOCTOR_UNIT_CHECKS_GROUP,
	STM32_FIRMWARE_UNIT_CHECKS_GROUP,
	SUPPORTED_PLATFORMS_UNIT_CHECKS_GROUP,
	TEST_SOURCES_DIRECTORY,
	UPDATE_SNAPSHOTS_FLAG,
} from "./constants.js";
import { runCoreSurfaceChecks } from "./core-surface-checks.js";
import { runCubeIdeChecks } from "./cubeide-checks.js";
import { runRegistryIntTypeParityChecks } from "./int-type-parity-checks.js";
import { listLanguageSnapshots } from "./language-snapshots.js";
import { runLintPolicyChecks } from "./lint-policy-checks.js";
import { runLspCompletionChecks } from "./lsp-completion-checks.js";
import { runLspDiagnosticsChecks } from "./lsp-diagnostics-checks.js";
import { runLspHoverChecks } from "./lsp-hover-checks.js";
import { runLspInterruptChecks } from "./lsp-interrupt-checks.js";
import { runLspObjectSelfReferenceChecks } from "./lsp-object-self-reference-checks.js";
import { runLspPrefixDiagnosticsChecks } from "./lsp-prefix-diagnostics-checks.js";
import { runLspSerial2Checks } from "./lsp-serial2-checks.js";
import { runLspStrictEqualityChecks } from "./lsp-strict-equality-checks.js";
import { runLspString2Checks } from "./lsp-string2-checks.js";
import { runLspString3Checks } from "./lsp-string3-checks.js";
import { runLspUnionChecks } from "./lsp-union-checks.js";
import { runLspWireChecks } from "./lsp-wire-checks.js";
import { runLspWireSlaveChecks } from "./lsp-wire-slave-checks.js";
import { buildEntry, copyEntryFiles, createProject } from "./project-setup.js";
import { runRegistryCoreParityChecks } from "./registry-core-parity-checks.js";
import { runRegistryDocCommentChecks } from "./registry-doc-comment-checks.js";
import { runRegistryEnumResolutionChecks } from "./registry-enum-resolution-checks.js";
import { runRegistryInt128NegationChecks } from "./registry-int128-negation-checks.js";
import { runRegistryPostInstallChecks } from "./registry-post-install-checks.js";
import { printGroupStatus, reportUnitChecks } from "./reporting.js";
import { runSharedConstantsChecks } from "./shared-constants-checks.js";
import { processSnapshotFile, snapshotBuild } from "./snapshot-comparison.js";
import { listFormatterSnapshots } from "./src/formatter/generate-formatter-snapshots.mjs";
import { runStm32DoctorChecks } from "./stm32-doctor-checks.js";
import { runStm32FirmwareChecks } from "./stm32-firmware-checks.js";
import { runStm32ParallelCompileChecks } from "./stm32-parallel-compile-checks.js";
import { runSupportedPlatformsChecks } from "./supported-platforms-checks.js";
import { runMonitorStateChecks } from "./unit-checks.js";

const buildLanguageResults = (updateSnapshots) => {
	const results = [];

	for (const { fileName, snapshotPath, content } of listLanguageSnapshots()) {
		const status = processSnapshotFile(snapshotPath, content, updateSnapshots);
		results.push({
			label: `${LANGUAGE_DIRECTORY_NAME}/${fileName}`,
			...status,
		});
	}

	return results;
};

const buildFormatterResults = (temporaryDirectory, updateSnapshots) => {
	const results = [];
	const formatterCopiesDirectory = join(
		temporaryDirectory,
		FORMATTER_COPIES_DIRECTORY_NAME,
	);

	for (const {
		snapshotName,
		snapshotPath,
		content,
	} of listFormatterSnapshots()) {
		const copyPath = join(formatterCopiesDirectory, snapshotName);
		mkdirSync(dirname(copyPath), { recursive: true });
		writeFileSync(copyPath, content, UTF8);
		const status = processSnapshotFile(snapshotPath, content, updateSnapshots);
		results.push({
			label: `${FORMATTER_DIRECTORY_NAME}/${snapshotName}`,
			...status,
		});
	}

	return results;
};

const buildCategoryResults = async (
	projectDirectory,
	platformName,
	snapshotsDirectory,
	category,
	updateSnapshots,
) => {
	const results = [];

	for (const entryFile of listEntryFiles(
		listTestDirectory(platformName, category),
	)) {
		await buildEntry(projectDirectory, platformName, entryFile);
		const status = snapshotBuild(
			snapshotsDirectory,
			projectDirectory,
			platformName,
			entryFile,
			category,
			updateSnapshots,
		);
		results.push({
			label: `${platformName}/${category}/${entryFile}`,
			...status,
		});
	}

	return results;
};

const buildPlatformResults = async (
	platformName,
	temporaryDirectory,
	updateSnapshots,
) => {
	const sourceDirectory = join(TEST_SOURCES_DIRECTORY, platformName);
	const projectDirectory = await createProject(
		temporaryDirectory,
		platformName,
	);
	const snapshotsDirectory = join(sourceDirectory, SNAPSHOT_DIRECTORY_NAME);

	if (updateSnapshots) {
		rmSync(snapshotsDirectory, { recursive: true, force: true });
	}

	for (const category of listCategories()) {
		copyEntryFiles(listTestDirectory(platformName, category), projectDirectory);
	}

	const groupResults = [];
	for (const category of listCategories()) {
		groupResults.push(
			...(await buildCategoryResults(
				projectDirectory,
				platformName,
				snapshotsDirectory,
				category,
				updateSnapshots,
			)),
		);
	}

	return groupResults;
};

const collectMismatches = (results, mismatches) => {
	for (const result of results) {
		if (result.status === SNAPSHOT_STATUS.mismatch) {
			mismatches.push(result.label);
		}
	}
};

export const run = async () => {
	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), SNAPSHOT_TEMP_DIRECTORY_PREFIX),
	);
	const updateSnapshots = process.argv.includes(UPDATE_SNAPSHOTS_FLAG);
	const mismatches = [];

	const unitCheckResults = runMonitorStateChecks();
	reportUnitChecks(MONITOR_STATE_UNIT_CHECKS_GROUP, unitCheckResults);
	collectMismatches(unitCheckResults, mismatches);

	const coreSurfaceResults = runCoreSurfaceChecks();
	reportUnitChecks(CORE_SURFACE_UNIT_CHECKS_GROUP, coreSurfaceResults);
	collectMismatches(coreSurfaceResults, mismatches);

	const asyncLocalResults = runAsyncLocalChecks();
	reportUnitChecks(ASYNC_LOCAL_TYPES_UNIT_CHECKS_GROUP, asyncLocalResults);
	collectMismatches(asyncLocalResults, mismatches);

	const asyncTaskTypeResults = runAsyncTaskTypeChecks();
	reportUnitChecks(ASYNC_TASK_TYPE_UNIT_CHECKS_GROUP, asyncTaskTypeResults);
	collectMismatches(asyncTaskTypeResults, mismatches);

	const cliProjectResults = await runCliProjectChecks();
	reportUnitChecks(CLI_PROJECT_UNIT_CHECKS_GROUP, cliProjectResults);
	collectMismatches(cliProjectResults, mismatches);

	const closureFactoryResults = runClosureFactoryChecks();
	reportUnitChecks(CLOSURE_FACTORY_UNIT_CHECKS_GROUP, closureFactoryResults);
	collectMismatches(closureFactoryResults, mismatches);

	const lintPolicyResults = runLintPolicyChecks();
	reportUnitChecks(LINT_POLICY_UNIT_CHECKS_GROUP, lintPolicyResults);
	collectMismatches(lintPolicyResults, mismatches);

	const registryDocCommentResults = runRegistryDocCommentChecks();
	reportUnitChecks(
		REGISTRY_DOC_COMMENT_UNIT_CHECKS_GROUP,
		registryDocCommentResults,
	);
	collectMismatches(registryDocCommentResults, mismatches);

	const registryEnumResolutionResults = runRegistryEnumResolutionChecks();
	reportUnitChecks(
		REGISTRY_ENUM_RESOLUTION_UNIT_CHECKS_GROUP,
		registryEnumResolutionResults,
	);
	collectMismatches(registryEnumResolutionResults, mismatches);

	const registryInt128NegationResults = runRegistryInt128NegationChecks();
	reportUnitChecks(
		REGISTRY_INT128_NEGATION_UNIT_CHECKS_GROUP,
		registryInt128NegationResults,
	);
	collectMismatches(registryInt128NegationResults, mismatches);

	const registryPostInstallResults = runRegistryPostInstallChecks();
	reportUnitChecks(
		REGISTRY_POST_INSTALL_UNIT_CHECKS_GROUP,
		registryPostInstallResults,
	);
	collectMismatches(registryPostInstallResults, mismatches);

	const registryIntTypeParityResults = runRegistryIntTypeParityChecks();
	reportUnitChecks(
		REGISTRY_INT_TYPE_PARITY_UNIT_CHECKS_GROUP,
		registryIntTypeParityResults,
	);
	collectMismatches(registryIntTypeParityResults, mismatches);

	const registryCoreParityResults = runRegistryCoreParityChecks();
	reportUnitChecks(
		REGISTRY_CORE_PARITY_UNIT_CHECKS_GROUP,
		registryCoreParityResults,
	);
	collectMismatches(registryCoreParityResults, mismatches);

	const sharedConstantsResults = await runSharedConstantsChecks();
	reportUnitChecks(SHARED_CONSTANTS_UNIT_CHECKS_GROUP, sharedConstantsResults);
	collectMismatches(sharedConstantsResults, mismatches);

	const stm32ParallelCompileResults = await runStm32ParallelCompileChecks();
	reportUnitChecks(
		REGISTRY_STM32_PARALLEL_COMPILE_UNIT_CHECKS_GROUP,
		stm32ParallelCompileResults,
	);
	collectMismatches(stm32ParallelCompileResults, mismatches);

	const stm32FirmwareResults = await runStm32FirmwareChecks();
	reportUnitChecks(STM32_FIRMWARE_UNIT_CHECKS_GROUP, stm32FirmwareResults);
	collectMismatches(stm32FirmwareResults, mismatches);

	const stm32CubeIdeResults = await runCubeIdeChecks();
	reportUnitChecks(STM32_CUBEIDE_UNIT_CHECKS_GROUP, stm32CubeIdeResults);
	collectMismatches(stm32CubeIdeResults, mismatches);

	const stm32DoctorResults = await runStm32DoctorChecks();
	reportUnitChecks(STM32_DOCTOR_UNIT_CHECKS_GROUP, stm32DoctorResults);
	collectMismatches(stm32DoctorResults, mismatches);

	const supportedPlatformsResults = runSupportedPlatformsChecks();
	reportUnitChecks(
		SUPPORTED_PLATFORMS_UNIT_CHECKS_GROUP,
		supportedPlatformsResults,
	);
	collectMismatches(supportedPlatformsResults, mismatches);

	const lspHoverResults = await runLspHoverChecks();
	reportUnitChecks(LSP_HOVER_UNIT_CHECKS_GROUP, lspHoverResults);
	collectMismatches(lspHoverResults, mismatches);

	const lspString2Results = await runLspString2Checks();
	reportUnitChecks(LSP_HOVER_UNIT_CHECKS_GROUP, lspString2Results);
	collectMismatches(lspString2Results, mismatches);

	const lspSerial2Results = await runLspSerial2Checks();
	reportUnitChecks(LSP_HOVER_UNIT_CHECKS_GROUP, lspSerial2Results);
	collectMismatches(lspSerial2Results, mismatches);

	const lspString3Results = await runLspString3Checks();
	reportUnitChecks(LSP_HOVER_UNIT_CHECKS_GROUP, lspString3Results);
	collectMismatches(lspString3Results, mismatches);

	const lspInterruptResults = await runLspInterruptChecks();
	reportUnitChecks(LSP_HOVER_UNIT_CHECKS_GROUP, lspInterruptResults);
	collectMismatches(lspInterruptResults, mismatches);

	const lspUnionResults = await runLspUnionChecks();
	reportUnitChecks(LSP_DIAGNOSTICS_UNIT_CHECKS_GROUP, lspUnionResults);
	collectMismatches(lspUnionResults, mismatches);

	const lspStrictEqualityResults = await runLspStrictEqualityChecks();
	reportUnitChecks(LSP_DIAGNOSTICS_UNIT_CHECKS_GROUP, lspStrictEqualityResults);
	collectMismatches(lspStrictEqualityResults, mismatches);

	const lspDiagnosticsResults = await runLspDiagnosticsChecks();
	reportUnitChecks(LSP_DIAGNOSTICS_UNIT_CHECKS_GROUP, lspDiagnosticsResults);
	collectMismatches(lspDiagnosticsResults, mismatches);

	const lspPrefixDiagnosticsResults = await runLspPrefixDiagnosticsChecks();
	reportUnitChecks(
		LSP_DIAGNOSTICS_UNIT_CHECKS_GROUP,
		lspPrefixDiagnosticsResults,
	);
	collectMismatches(lspPrefixDiagnosticsResults, mismatches);

	const lspObjectSelfReferenceResults = await runLspObjectSelfReferenceChecks();
	reportUnitChecks(
		LSP_DIAGNOSTICS_UNIT_CHECKS_GROUP,
		lspObjectSelfReferenceResults,
	);
	collectMismatches(lspObjectSelfReferenceResults, mismatches);

	const lspWireResults = await runLspWireChecks();
	reportUnitChecks(LSP_HOVER_UNIT_CHECKS_GROUP, lspWireResults);
	collectMismatches(lspWireResults, mismatches);

	const lspWireSlaveResults = await runLspWireSlaveChecks();
	reportUnitChecks(LSP_HOVER_UNIT_CHECKS_GROUP, lspWireSlaveResults);
	collectMismatches(lspWireSlaveResults, mismatches);

	const lspCompletionResults = runLspCompletionChecks();
	reportUnitChecks(LSP_COMPLETION_UNIT_CHECKS_GROUP, lspCompletionResults);
	collectMismatches(lspCompletionResults, mismatches);

	const platformNames = listPlatformNames();
	const parityErrors = validatePlatformTestParity(platformNames);
	if (parityErrors.length > 0) {
		for (const error of parityErrors) {
			process.stderr.write(`${RED_CROSS} ${error}\n`);
		}
		process.exit(1);
	}

	try {
		const languageResults = buildLanguageResults(updateSnapshots);
		printGroupStatus(LANGUAGE_DIRECTORY_NAME, languageResults);
		collectMismatches(languageResults, mismatches);

		const formatterResults = buildFormatterResults(
			temporaryDirectory,
			updateSnapshots,
		);
		printGroupStatus(FORMATTER_DIRECTORY_NAME, formatterResults);
		collectMismatches(formatterResults, mismatches);

		for (const platformName of platformNames) {
			const groupResults = await buildPlatformResults(
				platformName,
				temporaryDirectory,
				updateSnapshots,
			);
			printGroupStatus(platformName, groupResults);
			collectMismatches(groupResults, mismatches);
		}
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}

	if (mismatches.length > 0) {
		process.stderr.write(
			`${RED_CROSS} ${mismatches.length} snapshot(s) out of date\n`,
		);
		process.exit(1);
	}
	process.stdout.write(`${GREEN_CHECK} All snapshots up to date\n`);
};
