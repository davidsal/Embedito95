const CUBEIDE_REQUIREMENT_LABEL = "STM32CubeIDE";
const FIRMWARE_REQUIREMENT_LABEL = "STM32CubeF1 firmware";
const INSTALL_CUBEIDE_HINT = "Install STM32CubeIDE";
const DOWNLOAD_FIRMWARE_HINT = "Download STM32CubeF1 firmware";
const CUBEIDE_ROOT_CONFIRM =
	"Do you want to add the STM32CubeIDE installation path?";
const CUBEIDE_ROOT_PROMPT = "STM32CubeIDE installation path";
const FIRMWARE_DOWNLOAD_CONFIRM =
	"Do you want to download the STM32CubeF1 firmware?";

const isCubeIdeInstalled = ({ shared, spawnSync }) => {
	return (
		shared.findStm32Toolchain() !== null &&
		shared.findStm32CubeProg({ spawnSync }) !== null
	);
};

export const doctorRequirements = ({ shared, spawnSync }) => {
	return [
		{
			label: CUBEIDE_REQUIREMENT_LABEL,
			satisfied: isCubeIdeInstalled({ shared, spawnSync }),
			fixHint: INSTALL_CUBEIDE_HINT,
		},
		{
			label: FIRMWARE_REQUIREMENT_LABEL,
			satisfied: shared.findStm32FirmwareCache() !== null,
			fixHint: DOWNLOAD_FIRMWARE_HINT,
		},
	];
};

const isRequirementUnsatisfied = ({ requirements, label }) => {
	const requirement = requirements.find((candidate) => {
		return candidate.label === label;
	});

	return Boolean(requirement) && !requirement.satisfied;
};

const repairCubeIde = async ({ confirm, readText, requirements, shared }) => {
	const cubeIdeMissing = isRequirementUnsatisfied({
		requirements,
		label: CUBEIDE_REQUIREMENT_LABEL,
	});

	if (!cubeIdeMissing) {
		return false;
	}

	const shouldConfigurePath = await confirm({
		message: CUBEIDE_ROOT_CONFIRM,
		default: true,
	});

	if (!shouldConfigurePath) {
		return false;
	}

	const answer = await readText({ message: CUBEIDE_ROOT_PROMPT });

	if (!answer) {
		return false;
	}

	return shared.setCubeIdeRoot({ root: answer.trim() });
};

const repairFirmware = async ({ confirm, log, requirements, shared }) => {
	const firmwareMissing = isRequirementUnsatisfied({
		requirements,
		label: FIRMWARE_REQUIREMENT_LABEL,
	});

	if (!firmwareMissing) {
		return false;
	}

	const shouldDownload = await confirm({
		message: FIRMWARE_DOWNLOAD_CONFIRM,
		default: true,
	});

	if (!shouldDownload) {
		return false;
	}

	await shared.downloadStm32FirmwareCache({ log });
	return true;
};

export const doctorRepair = async ({
	confirm,
	log,
	readText,
	requirements,
	shared,
}) => {
	const cubeIdeRepaired = await repairCubeIde({
		confirm,
		readText,
		requirements,
		shared,
	});
	const firmwareRepaired = await repairFirmware({
		confirm,
		log,
		requirements,
		shared,
	});

	return cubeIdeRepaired || firmwareRepaired;
};
