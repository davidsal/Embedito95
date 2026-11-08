// Hermetic checks for the STM32CubeF1 firmware downloader (TICKET-97). The tar
// reader is exercised with handcrafted archives and the download flow with an
// injected cache directory and a mocked `fetch`, so no test touches
// `~/.embedito95` or the network.
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { findStm32FirmwareCache } from "../core/src/strategy-shared/cubeide.js";
import {
	downloadStm32FirmwareCache,
	extractTarArchive,
	toSafeRelativePath,
} from "../core/src/strategy-shared/stm32-firmware.js";
import { expectEqual } from "./reporting.js";

const TAR_BLOCK_SIZE = 512;
const TAR_NAME_LENGTH = 100;
const TAR_SIZE_OFFSET = 124;
const TAR_SIZE_LENGTH = 12;
const TAR_TYPE_OFFSET = 156;
const TAR_END_BLOCK_COUNT = 2;
const TAR_DIRECTORY_TYPE = "5";
const TAR_FILE_TYPE = "0";
const TAR_GNU_LONG_NAME_TYPE = "L";
const TAR_PAX_EXTENDED_HEADER_TYPE = "x";
const TAR_SYMLINK_TYPE = "2";
const TAR_HARDLINK_TYPE = "1";
const TAR_OCTAL_RADIX = 8;
const TAR_NULL_BYTE_LENGTH = 1;
const UTF8 = "utf8";
const ROOT_PREFIX = "STM32CubeF1-1.8.7";
const TEMPORARY_DIRECTORY_PREFIX = "embedito95-stm32-firmware-";
const DOWNLOAD_FAILED_MESSAGE =
	"Failed to download STM32CubeF1 firmware. Check your internet connection and try again.";
const DOWNLOAD_INCOMPLETE_MESSAGE =
	"Downloaded STM32CubeF1 firmware is incomplete.";
const TRUNCATED_ARCHIVE_MESSAGE = "STM32CubeF1 firmware archive is truncated.";
const MAIN_ARCHIVE_URL_MARKER = "STM32CubeF1";
const CMSIS_ARCHIVE_URL_MARKER = "cmsis_device_f1";
const TRUNCATED_ENTRY_SIZE = 100;
const TRUNCATED_ENTRY_CONTENT = "short";

const writeOctal = ({ value, length }) => {
	return `${value.toString(TAR_OCTAL_RADIX).padStart(length - TAR_NULL_BYTE_LENGTH, "0")}\0`;
};

const createTarHeader = ({ name, size, type }) => {
	const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
	header.write(name, 0, TAR_NAME_LENGTH, UTF8);
	header.write(
		writeOctal({ value: size, length: TAR_SIZE_LENGTH }),
		TAR_SIZE_OFFSET,
		TAR_SIZE_LENGTH,
		UTF8,
	);
	header.write(type, TAR_TYPE_OFFSET, TAR_NULL_BYTE_LENGTH, UTF8);
	return header;
};

const createTarEntry = ({ name, content = "", type = TAR_FILE_TYPE }) => {
	const data = Buffer.from(content, UTF8);
	const size = type === TAR_DIRECTORY_TYPE ? 0 : data.length;
	const paddedData = Buffer.alloc(
		Math.ceil(data.length / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE,
		0,
	);
	data.copy(paddedData);
	return Buffer.concat([createTarHeader({ name, size, type }), paddedData]);
};

const createTarArchive = ({ entries }) => {
	const endBlocks = Buffer.alloc(TAR_BLOCK_SIZE * TAR_END_BLOCK_COUNT, 0);
	return Buffer.concat([
		...entries.map((entry) => {
			return createTarEntry(entry);
		}),
		endBlocks,
	]);
};

const withTemporaryDirectory = async (callback) => {
	const directory = mkdtempSync(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
	try {
		return await callback(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const readFileContent = ({ path }) => {
	return readFileSync(path, UTF8);
};

const extractSingleEntry = ({ entries, destinationPath }) => {
	const archive = createTarArchive({ entries });
	return {
		archive,
		extract: () => {
			extractTarArchive({ archive, destination: destinationPath });
		},
	};
};

const checkSafeRelativePathNormalization = () => {
	return [
		expectEqual(
			"firmware path strips the archive root directory",
			toSafeRelativePath({
				archivePath: `${ROOT_PREFIX}/Drivers/file.h`,
			}),
			"Drivers/file.h",
		),
		expectEqual(
			"firmware path normalizes POSIX absolute paths",
			toSafeRelativePath({ archivePath: "/Drivers/file.h" }),
			"Drivers/file.h",
		),
		expectEqual(
			"firmware path normalizes Windows separators and drive letters",
			toSafeRelativePath({
				archivePath: "C:\\Drivers\\CMSIS\\file.h",
			}),
			"Drivers/CMSIS/file.h",
		),
		expectEqual(
			"firmware path rejects parent-directory traversal",
			toSafeRelativePath({ archivePath: `${ROOT_PREFIX}/../evil.h` }),
			null,
		),
		expectEqual(
			"firmware path rejects nested parent-directory traversal",
			toSafeRelativePath({
				archivePath: `${ROOT_PREFIX}/Drivers/../../evil.h`,
			}),
			null,
		),
		expectEqual(
			"firmware path ignores the current-directory segment",
			toSafeRelativePath({ archivePath: `${ROOT_PREFIX}/./Drivers/file.h` }),
			"Drivers/file.h",
		),
	];
};

const checkTarExtraction = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const nestedDestination = join(temporaryDirectory, "nested");
		const nestedFile = join(nestedDestination, "Drivers", "CMSIS", "core.h");
		const directoryDestination = join(temporaryDirectory, "directories");
		const createdDirectory = join(
			directoryDestination,
			"Drivers",
			"STM32F1xx_HAL_Driver",
		);
		const longNameDestination = join(temporaryDirectory, "long-name");
		const longNamePath = join(
			longNameDestination,
			"Drivers",
			"CMSIS",
			"Device",
			"ST",
			"STM32F1xx",
			"Include",
			"stm32f103xb.h",
		);
		const ignoredDestination = join(temporaryDirectory, "ignored");
		const ignoredFile = join(ignoredDestination, "Drivers", "link.h");

		extractSingleEntry({
			entries: [
				{
					name: `${ROOT_PREFIX}/Drivers/CMSIS/core.h`,
					content: "core",
				},
			],
			destinationPath: nestedDestination,
		}).extract();
		extractSingleEntry({
			entries: [
				{
					name: `${ROOT_PREFIX}/Drivers/STM32F1xx_HAL_Driver/`,
					type: TAR_DIRECTORY_TYPE,
				},
			],
			destinationPath: directoryDestination,
		}).extract();
		extractSingleEntry({
			entries: [
				{
					name: "././@LongLink",
					content: `${ROOT_PREFIX}/Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h\0`,
					type: TAR_GNU_LONG_NAME_TYPE,
				},
				{
					name: "short.h",
					content: "long-name",
				},
			],
			destinationPath: longNameDestination,
		}).extract();
		extractSingleEntry({
			entries: [
				{
					name: "././@PaxHeader",
					content: `30 path=${ROOT_PREFIX}/Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h\n`,
					type: TAR_PAX_EXTENDED_HEADER_TYPE,
				},
				{
					name: "short.h",
					content: "pax-name",
				},
			],
			destinationPath: join(temporaryDirectory, "pax-name"),
		}).extract();
		extractSingleEntry({
			entries: [
				{
					name: `${ROOT_PREFIX}/Drivers/link.h`,
					content: "target.h",
					type: TAR_SYMLINK_TYPE,
				},
				{
					name: `${ROOT_PREFIX}/Drivers/hard.h`,
					content: "target.h",
					type: TAR_HARDLINK_TYPE,
				},
			],
			destinationPath: ignoredDestination,
		}).extract();

		const paxNameFile = join(
			temporaryDirectory,
			"pax-name",
			"Drivers",
			"CMSIS",
			"Device",
			"ST",
			"STM32F1xx",
			"Include",
			"stm32f103xb.h",
		);

		return [
			expectEqual(
				"firmware tar extracts a nested regular file",
				readFileContent({ path: nestedFile }),
				"core",
			),
			expectEqual(
				"firmware tar recreates directory entries",
				existsSync(createdDirectory),
				true,
			),
			expectEqual(
				"firmware tar honors a GNU long name",
				readFileContent({ path: longNamePath }),
				"long-name",
			),
			expectEqual(
				"firmware tar honors a PAX extended path",
				readFileContent({ path: paxNameFile }),
				"pax-name",
			),
			expectEqual(
				"firmware tar ignores symlink and hardlink entries",
				existsSync(ignoredFile),
				false,
			),
		];
	});
};

const checkTarTruncation = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const truncatedHeader = createTarHeader({
			name: `${ROOT_PREFIX}/Drivers/truncated.h`,
			size: TRUNCATED_ENTRY_SIZE,
			type: TAR_FILE_TYPE,
		});
		const truncatedArchive = Buffer.concat([
			truncatedHeader,
			Buffer.from(TRUNCATED_ENTRY_CONTENT, UTF8),
		]);
		const targetPath = join(temporaryDirectory, "truncated");

		try {
			extractTarArchive({
				archive: truncatedArchive,
				destination: targetPath,
			});
			return [
				expectEqual(
					"firmware tar rejects a truncated entry",
					"no error",
					TRUNCATED_ARCHIVE_MESSAGE,
				),
			];
		} catch (error) {
			return [
				expectEqual(
					"firmware tar rejects a truncated entry",
					error.message,
					TRUNCATED_ARCHIVE_MESSAGE,
				),
				expectEqual(
					"firmware tar does not write a truncated entry",
					existsSync(join(targetPath, "Drivers")),
					false,
				),
			];
		}
	});
};

const createMainArchive = () => {
	return createTarArchive({
		entries: [
			{
				name: `${ROOT_PREFIX}/Drivers/CMSIS/Include/stm32f1xx.h`,
				content: "cmsis",
			},
			{
				name: `${ROOT_PREFIX}/Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h`,
				content: "device",
			},
			{
				name: `${ROOT_PREFIX}/Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/startup_stm32f103xb.s`,
				content: "startup",
			},
			{
				name: `${ROOT_PREFIX}/Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/linker/STM32F103XB_FLASH.ld`,
				content: "linker",
			},
			{
				name: `${ROOT_PREFIX}/Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/system_stm32f1xx.c`,
				content: "system",
			},
		],
	});
};

const createCmsisArchive = () => {
	return createTarArchive({
		entries: [
			{
				name: `${ROOT_PREFIX}/Include/stm32f103xb.h`,
				content: "cmsis-device",
			},
		],
	});
};

const createHalArchive = () => {
	return createTarArchive({
		entries: [
			{
				name: `${ROOT_PREFIX}/Inc/stm32f1xx_hal.h`,
				content: "hal",
			},
			{
				name: `${ROOT_PREFIX}/Src/stm32f1xx_ll_utils.c`,
				content: "hal-utils",
			},
		],
	});
};

const createResponse = ({ archive }) => {
	return {
		ok: true,
		arrayBuffer: async () => {
			return archive.buffer.slice(
				archive.byteOffset,
				archive.byteOffset + archive.byteLength,
			);
		},
	};
};

const selectArchive = ({ url, mainArchive, cmsisArchive, halArchive }) => {
	if (url.includes(MAIN_ARCHIVE_URL_MARKER)) {
		return mainArchive;
	}
	if (url.includes(CMSIS_ARCHIVE_URL_MARKER)) {
		return cmsisArchive;
	}
	return halArchive;
};

const createDownloadFetch = ({
	mainArchive = gzipSync(createMainArchive()),
	cmsisArchive = gzipSync(createCmsisArchive()),
	halArchive = gzipSync(createHalArchive()),
	ok = true,
} = {}) => {
	return async (url) => {
		if (!ok) {
			return { ok: false };
		}
		return createResponse({
			archive: selectArchive({ url, mainArchive, cmsisArchive, halArchive }),
		});
	};
};

const withRestoredFetch = async (fetchImplementation, callback) => {
	const previousFetch = globalThis.fetch;
	globalThis.fetch = fetchImplementation;
	try {
		return await callback();
	} finally {
		globalThis.fetch = previousFetch;
	}
};

const captureError = async (callback) => {
	try {
		await callback();
		return null;
	} catch (error) {
		return error.message;
	}
};

const writeCompleteCache = ({ cacheDirectory }) => {
	const files = [
		"Drivers/CMSIS/Include/stm32f1xx.h",
		"Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h",
		"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/startup_stm32f103xb.s",
		"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/linker/STM32F103XB_FLASH.ld",
		"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/system_stm32f1xx.c",
		"Drivers/STM32F1xx_HAL_Driver/Inc/stm32f1xx_hal.h",
		"Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_ll_utils.c",
	];
	for (const relativePath of files) {
		const filePath = join(cacheDirectory, relativePath);
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, "cached");
	}
};

const checkDownloadWithMockedFetch = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const cacheDirectory = join(temporaryDirectory, "cache");
		const loggedMessages = [];
		const result = await withRestoredFetch(createDownloadFetch(), () => {
			return downloadStm32FirmwareCache({
				cacheDirectory,
				log: (message) => {
					loggedMessages.push(message);
				},
			});
		});

		return [
			expectEqual(
				"firmware download returns the cache directory",
				result,
				cacheDirectory,
			),
			expectEqual(
				"firmware download reports what it is doing",
				loggedMessages.length,
				1,
			),
			expectEqual(
				"firmware download satisfies the required cache layout",
				findStm32FirmwareCache({ cacheDirectory }),
				cacheDirectory,
			),
		];
	});
};

const checkSkipsDownloadWithCompleteCache = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const cacheDirectory = join(temporaryDirectory, "cache");
		writeCompleteCache({ cacheDirectory });
		const result = await withRestoredFetch(
			async () => {
				throw new Error("fetch must not be called");
			},
			() => {
				return downloadStm32FirmwareCache({ cacheDirectory });
			},
		);

		return [
			expectEqual(
				"firmware with a complete cache is not downloaded again",
				result,
				cacheDirectory,
			),
		];
	});
};

const checkCleansCacheOnFailure = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const cacheDirectory = join(temporaryDirectory, "cache");
		const failureMessage = await withRestoredFetch(
			createDownloadFetch({ ok: false }),
			() => {
				return captureError(() => {
					return downloadStm32FirmwareCache({ cacheDirectory });
				});
			},
		);

		return [
			expectEqual(
				"firmware download failure reports the network message",
				failureMessage,
				DOWNLOAD_FAILED_MESSAGE,
			),
			expectEqual(
				"firmware download failure cleans the partial cache",
				existsSync(cacheDirectory),
				false,
			),
		];
	});
};

const checkCorruptedArchiveMessage = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const cacheDirectory = join(temporaryDirectory, "cache");
		const failureMessage = await withRestoredFetch(
			async () => {
				return createResponse({ archive: Buffer.from("not-gzip") });
			},
			() => {
				return captureError(() => {
					return downloadStm32FirmwareCache({ cacheDirectory });
				});
			},
		);

		return [
			expectEqual(
				"firmware download reports a corrupted archive as a download failure",
				failureMessage,
				DOWNLOAD_FAILED_MESSAGE,
			),
		];
	});
};

const checkIncompleteArchiveMessage = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const cacheDirectory = join(temporaryDirectory, "cache");
		const emptyArchive = gzipSync(
			createTarArchive({
				entries: [
					{
						name: `${ROOT_PREFIX}/README.md`,
						content: "no firmware here",
					},
				],
			}),
		);
		const failureMessage = await withRestoredFetch(
			createDownloadFetch({
				mainArchive: emptyArchive,
				cmsisArchive: emptyArchive,
				halArchive: emptyArchive,
			}),
			() => {
				return captureError(() => {
					return downloadStm32FirmwareCache({ cacheDirectory });
				});
			},
		);

		return [
			expectEqual(
				"firmware download reports an incomplete cache",
				failureMessage,
				DOWNLOAD_INCOMPLETE_MESSAGE,
			),
			expectEqual(
				"firmware download cleans the incomplete cache",
				existsSync(cacheDirectory),
				false,
			),
		];
	});
};

export const runStm32FirmwareChecks = async () => {
	return [
		...checkSafeRelativePathNormalization(),
		...(await checkTarExtraction()),
		...(await checkTarTruncation()),
		...(await checkDownloadWithMockedFetch()),
		...(await checkSkipsDownloadWithCompleteCache()),
		...(await checkCleansCacheOnFailure()),
		...(await checkCorruptedArchiveMessage()),
		...(await checkIncompleteArchiveMessage()),
	];
};
