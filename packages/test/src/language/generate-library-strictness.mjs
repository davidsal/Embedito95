import { ERROR_CODE } from "embedito95-core";
import {
	buildSnapshotReport,
	checkSource,
	createLibraries,
	hasErrorCode,
	isMainModule,
	listSnapshots,
	renderFlagCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const LIBRARIES = createLibraries({ isLibrary: true });

const renderCase = ({ body, description }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	return renderFlagCase({
		description,
		label: "unknownType",
		flag: hasErrorCode(errors, ERROR_CODE.unknownType),
	});
};

const buildReport = () => {
	const cases = [
		{
			description: "library variable annotated with u9 -> unknownType error",
			body: ["export const DISPLAY_I2C_ADDRESS: u9 = 60"],
		},
		{
			description: "library param typed e95.postinstall.pwmType placeholder -> ok",
			body: [
				"export const setAnalog = (pin: u8, value: e95.postinstall.pwmType) => {}",
			],
		},
		{
			description: "library function param annotated with u9 -> unknownType error",
			body: ["export const setAnalog = (pin: u9) => {}"],
		},
		{
			description: "library param with a valid primitive type -> ok",
			body: ["export const setDigital = (value: u8) => {}"],
		},
		{
			description: "library variable with a valid primitive type -> ok",
			body: ["export const DISPLAY_I2C_ADDRESS: u8 = 60"],
		},
	];

	const header = [
		"// Library type strictness (Issue 3).",
		"// unknownType must fire in library files for invalid types (u9), while",
		"// e95.postinstall.* placeholder params are allowed.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listLibraryStrictnessSnapshots = () => {
	return listSnapshots("library-strictness.txt", buildReport());
};

export const writeLibraryStrictnessSnapshots = () => {
	writeSnapshots(listLibraryStrictnessSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeLibraryStrictnessSnapshots();
	console.log("Generated library-strictness.txt");
}
