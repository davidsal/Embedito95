import {
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
} from "../shared/directories.js";
import { resolveCompileJobCount, runCompileJobs } from "./compile-jobs.js";
import {
	ARTIFACTS_DIRECTORY_NAME,
	COMPILE_TIMEOUT_MILLISECONDS,
	TOOLCHAIN_NOT_FOUND_MESSAGE,
} from "./constants.js";

const collectSourceFiles = ({ readdirSync, outputDirectory, joinPath }) => {
	const sourceFiles = [];
	const includeDirectories = [outputDirectory];

	for (const entry of readdirSync(outputDirectory, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".cpp")) {
			sourceFiles.push(joinPath(outputDirectory, entry.name));
			continue;
		}
		if (
			!entry.isDirectory() ||
			(entry.name !== LIBRARIES_DIRECTORY_NAME &&
				entry.name !== CORE_LIBRARIES_DIRECTORY_NAME &&
				entry.name !== MODULES_DIRECTORY_NAME)
		) {
			continue;
		}

		const librariesDirectory = joinPath(outputDirectory, entry.name);
		for (const libraryName of readdirSync(librariesDirectory)) {
			const libraryDirectory = joinPath(librariesDirectory, libraryName);
			// Headers reference their siblings (e.g. `core_system.h` includes the
			// bare `core_type.h` in `core/type/`), so every module directory must be
			// an include root for `"…"` lookup to reach across modules.
			includeDirectories.push(libraryDirectory);
			for (const fileName of readdirSync(libraryDirectory)) {
				if (fileName.endsWith(".cpp")) {
					sourceFiles.push(joinPath(libraryDirectory, fileName));
				}
			}
		}
	}

	return { sourceFiles, includeDirectories };
};

const compileTranslationUnit = async ({ job, context }) => {
	const compileResult = await context.shared.runSpawnedProcess(
		context.compilerPath,
		[...context.compilerBaseArguments, "-o", job.objectPath, job.sourceFile],
		{ timeout: context.timeout },
	);

	if (compileResult.code !== 0) {
		const stderr = compileResult.stderr.trim();
		throw new Error(
			stderr
				? `Compilation failed:\n${stderr}`
				: `Compilation failed for ${job.sourceFile}`,
		);
	}
};

export const compile = async ({
	outputDir,
	projectName,
	platform,
	shared,
	maximumCompileJobs,
	log = console.log,
}) => {
	const { mkdirSync, readdirSync } = await import("node:fs");
	const { basename, join } = await import("node:path");

	const mcuDefine = platform?.specs?.mcuDefine ?? "STM32F103xB";

	if (!shared.findStm32FirmwareCache()) {
		throw new Error(
			"STM32 firmware not found and could not be downloaded automatically. Check your internet connection and try again.",
		);
	}

	const toolchainBinDirectory = shared.findStm32Toolchain();

	if (!toolchainBinDirectory) {
		throw new Error(TOOLCHAIN_NOT_FOUND_MESSAGE);
	}

	const { sourceFiles, includeDirectories } = collectSourceFiles({
		readdirSync,
		outputDirectory: outputDir,
		joinPath: join,
	});

	const includeArgs = [
		`${shared.STM32_FW_CACHE}/Drivers/CMSIS/Include`,
		`${shared.STM32_FW_CACHE}/Drivers/CMSIS/Device/ST/STM32F1xx/Include`,
		`${shared.STM32_FW_CACHE}/Drivers/STM32F1xx_HAL_Driver/Inc`,
		...includeDirectories,
	].flatMap((port) => {
		return ["-I", port];
	});

	const artifactsDirectory = join(outputDir, ARTIFACTS_DIRECTORY_NAME);
	mkdirSync(artifactsDirectory, { recursive: true });

	const compilerPath = join(
		toolchainBinDirectory,
		shared.ARM_COMPILER_EXECUTABLE,
	);
	const compilerBaseArguments = [
		"-std=c++17",
		"-c",
		"-mcpu=cortex-m3",
		"-mthumb",
		"-Os",
		"-fwrapv",
		"-ffunction-sections",
		"-fdata-sections",
		`-D${mcuDefine}`,
		...includeArgs,
	];

	const compileJobs = sourceFiles.map((sourceFile) => {
		return {
			sourceFile,
			objectPath: join(
				artifactsDirectory,
				basename(sourceFile).replace(/\.cpp$/, ".o"),
			),
		};
	});

	await runCompileJobs({
		jobs: compileJobs,
		maximumJobs: resolveCompileJobCount({ maximumCompileJobs }),
		runCompileJob: compileTranslationUnit,
		context: {
			shared,
			compilerPath,
			compilerBaseArguments,
			timeout: COMPILE_TIMEOUT_MILLISECONDS,
		},
	});

	// The scheduler consumes jobs in order but completes out of order, so the
	// object list is rebuilt from the original source order to keep the link
	// deterministic.
	const objectFiles = compileJobs.map(({ objectPath }) => {
		return objectPath;
	});

	const startup = join(
		shared.STM32_FW_CACHE,
		"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/startup_stm32f103xb.s",
	);
	const linkerScript = join(
		shared.STM32_FW_CACHE,
		"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/linker/STM32F103XB_FLASH.ld",
	);
	const systemInit = join(
		shared.STM32_FW_CACHE,
		"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/system_stm32f1xx.c",
	);
	const lowLevelUtils = join(
		shared.STM32_FW_CACHE,
		"Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_ll_utils.c",
	);

	const elfPath = join(artifactsDirectory, `${projectName}.elf`);
	const binaryPath = join(artifactsDirectory, `${projectName}.bin`);

	const linkResult = await shared.runSpawnedProcess(
		compilerPath,
		[
			"-mcpu=cortex-m3",
			"-mthumb",
			"-Os",
			"-ffunction-sections",
			"-fdata-sections",
			`-D${mcuDefine}`,
			...includeArgs,
			"-T",
			linkerScript,
			"-o",
			elfPath,
			...objectFiles,
			startup,
			systemInit,
			lowLevelUtils,
			"-Wl,--gc-sections",
			"--specs=nano.specs",
			"--specs=nosys.specs",
		],
		{ timeout: COMPILE_TIMEOUT_MILLISECONDS },
	);
	if (linkResult.code !== 0) {
		const stderr = linkResult.stderr.trim();
		throw new Error(stderr ? `Linking failed:\n${stderr}` : "Linking failed");
	}

	const binaryCopyTool = join(
		toolchainBinDirectory,
		shared.ARM_OBJCOPY_EXECUTABLE,
	);
	await shared.runSpawnedProcess(
		binaryCopyTool,
		["-O", "binary", elfPath, binaryPath],
		{
			timeout: 10000,
		},
	);

	const sizeBinaryPath = join(
		toolchainBinDirectory,
		shared.ARM_SIZE_EXECUTABLE,
	);
	const sizeResult = await shared.runSpawnedProcess(sizeBinaryPath, [elfPath], {
		timeout: 10000,
	});

	if (sizeResult.code === 0 && sizeResult.stdout) {
		const lines = sizeResult.stdout.split("\n");
		const values = lines[1]?.trim().split(/\s+/);
		if (values && values.length >= 4) {
			const text = parseInt(values[0], 10);
			const data = parseInt(values[1], 10);
			const bss = parseInt(values[2], 10);
			const flashTotal = text + data;
			const ramTotal = data + bss;
			const flashMax = platform?.specs?.flash;
			const ramMax = platform?.specs?.sram;

			if (flashMax && ramMax) {
				const flashPct = ((flashTotal / flashMax) * 100).toFixed(1);
				const ramPct = ((ramTotal / ramMax) * 100).toFixed(1);
				log(
					`\x1b[32m✔\x1b[39m Compiled   Flash: ${flashTotal} / ${flashMax} (${flashPct}%) | RAM: ${ramTotal} / ${ramMax} (${ramPct}%)`,
				);
				return;
			}
		}
	}
	log("\x1b[32m✔\x1b[39m Compiled");
};
