import { ERROR_CODE } from "embedito95-core";
import {
	buildSnapshotReport,
	checkSource,
	createLibraries,
	isMainModule,
	listSnapshots,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const CORE_PACKAGE = "@embedito95/serial";
const PORTABLE_PACKAGE = "@demo/lcd";

const USER_LIBRARIES = createLibraries();

const PORTABLE_LIBRARIES = createLibraries({
	isLibrary: true,
	libraryPackage: PORTABLE_PACKAGE,
	coreLibraryPackages: new Set([CORE_PACKAGE]),
});

const CORE_LIBRARIES = createLibraries({
	isLibrary: true,
	libraryPackage: CORE_PACKAGE,
	coreLibraryPackages: new Set([CORE_PACKAGE]),
});

const countErrors = (errors, errorCode) => {
	return errors.filter((error) => {
		return error.code === errorCode;
	}).length;
};

const renderCase = ({ description, body, libraries }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, libraries);
	const unionCount = countErrors(errors, ERROR_CODE.arbitraryUnion);
	const assignmentCount = countErrors(errors, ERROR_CODE.assignmentTypeMismatch);
	const unknownCount = countErrors(errors, ERROR_CODE.unknownType);
	const argumentCount = countErrors(errors, ERROR_CODE.argumentTypeMismatch);
	return [
		`// ${description}`,
		`arbitraryUnion: ${unionCount}`,
		`assignmentTypeMismatch: ${assignmentCount}`,
		`unknownType: ${unknownCount}`,
		`argumentTypeMismatch: ${argumentCount}`,
		"",
	].join("\n");
};

const buildReport = () => {
	const cases = [
		{
			description: "user variable with an arbitrary union -> arbitraryUnion error",
			body: ['const value: string | u8 = "a"'],
			libraries: USER_LIBRARIES,
		},
		{
			description: "user variable with T|null -> no union error",
			body: ['const value: string | null = "a"'],
			libraries: USER_LIBRARIES,
		},
		{
			description: "user parameter with an arbitrary union -> arbitraryUnion error",
			body: ["const handle = (data: string | u8) => {}"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "user return type with an arbitrary union -> arbitraryUnion error",
			body: ['const read = (): string | u8 => { return "a" }'],
			libraries: USER_LIBRARIES,
		},
		{
			description: "user type field with an arbitrary union -> arbitraryUnion error",
			body: ["type Payload = { data: string | u8 }"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "user parameter with T|null -> no union error",
			body: ["const handle = (data: string | null) => {}"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "user return type with T|null -> no union error",
			body: ["const read = (): string | null => { return null }"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "null first in T|null -> no union error",
			body: ["const value: null | string = null"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "parameter with null first in T|null -> no union or unknown error",
			body: ["const handle = (data: null | string) => {}"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "return type with null first in T|null -> no union or unknown error",
			body: ["const read = (): null | string => { return null }"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "portable library parameter with null first in T|null -> no unknown error",
			body: ["export const handle = (data: null | string) => {}"],
			libraries: PORTABLE_LIBRARIES,
		},
		{
			description: "union of three members including null -> arbitraryUnion error",
			body: ["const value: u8 | u16 | null = null"],
			libraries: USER_LIBRARIES,
		},
		{
			description: "portable library variable with an arbitrary union -> arbitraryUnion error",
			body: ["export const value: string | u8 = \"a\""],
			libraries: PORTABLE_LIBRARIES,
		},
		{
			description: "portable library parameter with an arbitrary union -> arbitraryUnion error",
			body: ["export const handle = (data: string | u8) => {}"],
			libraries: PORTABLE_LIBRARIES,
		},
		{
			description: "portable library signature with T|null -> no union error",
			body: ["export const handle = (data: string | null) => {}"],
			libraries: PORTABLE_LIBRARIES,
		},
		{
			description: "core library method signature with an arbitrary union -> allowed",
			body: ["export type Sink = { send: (data: string | u8) => void }"],
			libraries: CORE_LIBRARIES,
		},
		{
			description: "core library parameter with an arbitrary union -> allowed",
			body: ["export const handle = (data: string | u8) => {}"],
			libraries: CORE_LIBRARIES,
		},
		{
			description: "core library variable with an arbitrary union -> arbitraryUnion error",
			body: ["export const target: string | u8 = \"a\""],
			libraries: CORE_LIBRARIES,
		},
		{
			description: "core library type field with an arbitrary union -> arbitraryUnion error",
			body: ["export type Payload = { data: string | u8 }"],
			libraries: CORE_LIBRARIES,
		},
	];

	const header = [
		"// Arbitrary unions are restricted to core library signatures with a C++",
		"// backend (overload set). User code and portable libraries only accept",
		"// 'T | null'; the union itself is reported once at the type location.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listArbitraryUnionSnapshots = () => {
	return listSnapshots("arbitrary-unions.txt", buildReport());
};

export const writeArbitraryUnionSnapshots = () => {
	writeSnapshots(listArbitraryUnionSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeArbitraryUnionSnapshots();
	console.log("Generated arbitrary-unions.txt");
}
