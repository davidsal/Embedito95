import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { findStm32FirmwareCache, STM32_FW_CACHE } from "./cubeide.js";

const STM32_FW_ARCHIVE_URL =
	"https://codeload.github.com/STMicroelectronics/STM32CubeF1/tar.gz/refs/tags/v1.8.7";
const CMSIS_DEVICE_ARCHIVE_URL =
	"https://codeload.github.com/STMicroelectronics/cmsis_device_f1/tar.gz/c8e9a4a4f16b6d2cb2a2083cbe5161025280fb22";
const HAL_DRIVER_ARCHIVE_URL =
	"https://codeload.github.com/STMicroelectronics/stm32f1xx_hal_driver/tar.gz/fee494a92b5ad331f92ad21f76c66a5cb83773ee";
const CMSIS_DEVICE_DIRECTORY = join(
	"Drivers",
	"CMSIS",
	"Device",
	"ST",
	"STM32F1xx",
);
const HAL_DRIVER_DIRECTORY = join("Drivers", "STM32F1xx_HAL_Driver");
const DOWNLOADING_FIRMWARE_MESSAGE = "Downloading STM32CubeF1 firmware...";
const DOWNLOAD_FAILED_MESSAGE =
	"Failed to download STM32CubeF1 firmware. Check your internet connection and try again.";
const DOWNLOAD_INCOMPLETE_MESSAGE =
	"Downloaded STM32CubeF1 firmware is incomplete.";
const TRUNCATED_ARCHIVE_MESSAGE = "STM32CubeF1 firmware archive is truncated.";
const DOWNLOAD_TIMEOUT_MILLIS = 300000;
const TAR_BLOCK_SIZE = 512;
const TAR_NAME_LENGTH = 100;
const TAR_SIZE_OFFSET = 124;
const TAR_SIZE_LENGTH = 12;
const TAR_TYPE_OFFSET = 156;
const TAR_PREFIX_OFFSET = 345;
const TAR_PREFIX_LENGTH = 155;
const TAR_DIRECTORY_TYPE = "5";
const TAR_REGULAR_TYPE = "\0";
const TAR_FILE_TYPE = "0";
const TAR_GNU_LONG_NAME_TYPE = "L";
const TAR_PAX_EXTENDED_HEADER_TYPE = "x";
const TAR_PAX_GLOBAL_HEADER_TYPE = "g";
const TAR_PATH_PREFIX = "path=";
const USER_AGENT = "embedito95";
const PATH_SEPARATOR = "/";
const WINDOWS_PATH_SEPARATOR = "\\";
const PARENT_DIRECTORY_SEGMENT = "..";
const CURRENT_DIRECTORY_SEGMENT = ".";
const EMPTY_SEGMENT = "";
const UTF8 = "utf8";

const doNothing = () => {};

const readTarString = ({ archive, offset, length }) => {
	const nullIndex = archive.indexOf(0, offset);
	const endIndex =
		nullIndex === -1 || nullIndex > offset + length
			? offset + length
			: nullIndex;

	return archive.toString(UTF8, offset, endIndex);
};

const readTarSize = ({ archive }) => {
	const rawSize = readTarString({
		archive,
		offset: TAR_SIZE_OFFSET,
		length: TAR_SIZE_LENGTH,
	}).trim();
	const parsedSize = Number.parseInt(rawSize, 8);

	return Number.isNaN(parsedSize) ? 0 : parsedSize;
};

const readTarPath = ({ archive, headerOffset }) => {
	const name = readTarString({
		archive,
		offset: headerOffset,
		length: TAR_NAME_LENGTH,
	});
	const prefix = readTarString({
		archive,
		offset: headerOffset + TAR_PREFIX_OFFSET,
		length: TAR_PREFIX_LENGTH,
	});

	return prefix ? `${prefix}${PATH_SEPARATOR}${name}` : name;
};

const readPaxPath = ({ archive, offset, size }) => {
	const text = archive.toString(UTF8, offset, offset + size);
	const pathIndex = text.indexOf(TAR_PATH_PREFIX);

	if (pathIndex === -1) {
		return null;
	}

	const pathEnd = text.indexOf("\n", pathIndex);
	return pathEnd === -1
		? text.slice(pathIndex + TAR_PATH_PREFIX.length)
		: text.slice(pathIndex + TAR_PATH_PREFIX.length, pathEnd);
};

const WINDOWS_DRIVE_SEGMENT_PATTERN = /^[A-Za-z]:$/;

export const toSafeRelativePath = ({ archivePath }) => {
	const normalizedPath = archivePath.replaceAll(
		WINDOWS_PATH_SEPARATOR,
		PATH_SEPARATOR,
	);
	const isAbsolutePath = normalizedPath.startsWith(PATH_SEPARATOR);
	const segments = normalizedPath.split(PATH_SEPARATOR).filter((segment) => {
		return segment !== EMPTY_SEGMENT && segment !== CURRENT_DIRECTORY_SEGMENT;
	});

	if (
		segments.some((segment) => {
			return segment === PARENT_DIRECTORY_SEGMENT;
		})
	) {
		return null;
	}

	const hasWindowsDrive =
		segments.length > 0 && WINDOWS_DRIVE_SEGMENT_PATTERN.test(segments[0]);

	if (hasWindowsDrive) {
		return segments.slice(1).join(PATH_SEPARATOR);
	}

	if (isAbsolutePath) {
		return segments.join(PATH_SEPARATOR);
	}

	return segments.slice(1).join(PATH_SEPARATOR);
};

const assertTarEntryFits = ({ archive, dataOffset, size }) => {
	if (dataOffset + size > archive.length) {
		throw new Error(TRUNCATED_ARCHIVE_MESSAGE);
	}
};

const writeTarEntry = ({ archive, dataOffset, size, targetPath, type }) => {
	if (type === TAR_DIRECTORY_TYPE) {
		mkdirSync(targetPath, { recursive: true });
		return;
	}

	if (type !== TAR_FILE_TYPE && type !== TAR_REGULAR_TYPE) {
		return;
	}

	mkdirSync(dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, archive.subarray(dataOffset, dataOffset + size));
};

export const extractTarArchive = ({ archive, destination }) => {
	let offset = 0;
	let pendingLongName = null;
	let pendingPaxPath = null;

	while (offset + TAR_BLOCK_SIZE <= archive.length) {
		const headerOffset = offset;
		const type = String.fromCharCode(archive[TAR_TYPE_OFFSET + headerOffset]);
		const size = readTarSize({ archive: archive.subarray(headerOffset) });
		const dataOffset = headerOffset + TAR_BLOCK_SIZE;
		const nextOffset =
			dataOffset + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;

		if (type === TAR_PAX_GLOBAL_HEADER_TYPE) {
			offset = nextOffset;
			continue;
		}

		if (type === TAR_GNU_LONG_NAME_TYPE) {
			pendingLongName = archive
				.toString(UTF8, dataOffset, dataOffset + size)
				.replace(/\0+$/, "");
			offset = nextOffset;
			continue;
		}

		if (type === TAR_PAX_EXTENDED_HEADER_TYPE) {
			pendingPaxPath =
				readPaxPath({ archive, offset: dataOffset, size }) ?? pendingPaxPath;
			offset = nextOffset;
			continue;
		}

		const archivePath =
			pendingPaxPath ??
			pendingLongName ??
			readTarPath({ archive, headerOffset });
		const relativePath = toSafeRelativePath({ archivePath });

		pendingPaxPath = null;
		pendingLongName = null;
		offset = nextOffset;

		if (!relativePath) {
			continue;
		}

		assertTarEntryFits({ archive, dataOffset, size });
		writeTarEntry({
			archive,
			dataOffset,
			size,
			targetPath: join(destination, relativePath),
			type,
		});
	}
};

const fetchArchive = async ({ url }) => {
	try {
		const response = await fetch(url, {
			headers: { "User-Agent": USER_AGENT },
			signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MILLIS),
		});

		if (!response.ok) {
			throw new Error(DOWNLOAD_FAILED_MESSAGE);
		}

		return Buffer.from(await response.arrayBuffer());
	} catch {
		throw new Error(DOWNLOAD_FAILED_MESSAGE);
	}
};

const decompressArchive = ({ compressedArchive }) => {
	try {
		return gunzipSync(compressedArchive);
	} catch {
		throw new Error(DOWNLOAD_FAILED_MESSAGE);
	}
};

const downloadArchiveTo = async ({ url, destination }) => {
	const compressedArchive = await fetchArchive({ url });
	const archive = decompressArchive({ compressedArchive });

	try {
		extractTarArchive({ archive, destination });
	} catch {
		throw new Error(DOWNLOAD_FAILED_MESSAGE);
	}
};

export const downloadStm32FirmwareCache = async ({
	log = doNothing,
	cacheDirectory = STM32_FW_CACHE,
	findCache = findStm32FirmwareCache,
} = {}) => {
	const installedCache = findCache({ cacheDirectory });

	if (installedCache) {
		return installedCache;
	}

	mkdirSync(dirname(cacheDirectory), { recursive: true });

	if (existsSync(cacheDirectory)) {
		rmSync(cacheDirectory, { recursive: true, force: true });
	}

	mkdirSync(cacheDirectory, { recursive: true });
	log(DOWNLOADING_FIRMWARE_MESSAGE);

	try {
		await downloadArchiveTo({
			url: STM32_FW_ARCHIVE_URL,
			destination: cacheDirectory,
		});
		await downloadArchiveTo({
			url: CMSIS_DEVICE_ARCHIVE_URL,
			destination: join(cacheDirectory, CMSIS_DEVICE_DIRECTORY),
		});
		await downloadArchiveTo({
			url: HAL_DRIVER_ARCHIVE_URL,
			destination: join(cacheDirectory, HAL_DRIVER_DIRECTORY),
		});

		const downloadedCache = findCache({ cacheDirectory });

		if (!downloadedCache) {
			throw new Error(DOWNLOAD_INCOMPLETE_MESSAGE);
		}

		return downloadedCache;
	} catch (error) {
		rmSync(cacheDirectory, { recursive: true, force: true });
		throw error;
	}
};
