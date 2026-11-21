import { ERROR_CODE } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import {
	checkSource,
	createLibraries,
	hasErrorCode,
} from "./src/language/language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const PERSONA_DECLARATIONS = [
	"type Persona = { name: string, age: i32 }",
	'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
	"const probandoTexto = (value: string) => {}",
	"const probandoEdad = (value: i32) => {}",
];

const FAKE_DEVICE_LIBRARY = "@embedito95/fake-device";
const DEVICE_LIBRARIES = createLibraries({
	knownLibraries: new Set([FAKE_DEVICE_LIBRARY]),
	libraryExports: {
		[FAKE_DEVICE_LIBRARY]: new Set(["getDevice"]),
	},
	libraryFunctions: {
		[FAKE_DEVICE_LIBRARY]: {
			getDevice: { params: [], returnType: "Device" },
		},
	},
	libraryObjectTypes: {
		[FAKE_DEVICE_LIBRARY]: {
			Device: {
				fields: {
					speed: { type: "u16" },
				},
				methods: {},
			},
		},
	},
});

const buildPersonaSource = (bodyLines) => {
	return [
		...PERSONA_DECLARATIONS,
		"const main = () => {",
		"    const persona = getPersona()",
		...bodyLines,
		"}",
	].join("\n");
};

const checkPersonaBody = (bodyLines) => {
	return checkSource(buildPersonaSource(bodyLines), LIBRARIES).errors;
};

const findUnknownMember = (errors) => {
	return errors.find((error) => {
		return error.code === ERROR_CODE.unknownMember;
	});
};

const checkUnknownArgumentMember = () => {
	const unknownName = checkPersonaBody(["    probandoTexto(persona.nom)"]);
	const nullName = checkPersonaBody(["    probandoTexto(persona.null)"]);
	const unknownError = findUnknownMember(unknownName);
	return [
		expectEqual(
			"unknown object property used as an argument reports unknownMember",
			hasErrorCode(unknownName, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"unknownMember keeps the property name and receiver type",
			`${unknownError?.params?.name}:${unknownError?.params?.type}`,
			"nom:Persona",
		),
		expectEqual(
			"unknownMember points at the property, not the receiver",
			`${unknownError?.location?.start?.line}:${unknownError?.location?.start?.column}`,
			"7:27",
		),
		expectEqual(
			"a missing property named null reports unknownMember",
			hasErrorCode(nullName, ERROR_CODE.unknownMember),
			true,
		),
	];
};

const checkKnownObjectMembers = () => {
	const errors = checkPersonaBody([
		"    probandoTexto(persona.name)",
		"    probandoEdad(persona.age)",
	]);
	return expectEqual(
		"declared object fields do not report unknownMember",
		hasErrorCode(errors, ERROR_CODE.unknownMember),
		false,
	);
};

const checkUnknownMemberInOtherPositions = () => {
	const bareAccess = checkPersonaBody(["    persona.nom"]);
	const initializer = checkPersonaBody(["    const value: i32 = persona.nom"]);
	return [
		expectEqual(
			"a bare unknown property access reports unknownMember",
			hasErrorCode(bareAccess, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"an unknown property in an initializer reports unknownMember",
			hasErrorCode(initializer, ERROR_CODE.unknownMember),
			true,
		),
	];
};

const checkDanglingMemberAccess = () => {
	const danglingStatement = checkPersonaBody(["    persona."]);
	const danglingInitializer = checkPersonaBody(["    const nombre = persona."]);
	return [
		expectEqual(
			"a dangling member statement still reports expectedStatement",
			hasErrorCode(danglingStatement, ERROR_CODE.expectedStatement),
			true,
		),
		expectEqual(
			"a dangling member statement does not invent unknownMember",
			hasErrorCode(danglingStatement, ERROR_CODE.unknownMember),
			false,
		),
		expectEqual(
			"a dangling member initializer does not break the checker",
			Array.isArray(danglingInitializer),
			true,
		),
	];
};

const checkLibraryObjectMembers = () => {
	const source = [
		`import { getDevice } from '${FAKE_DEVICE_LIBRARY}'`,
		"const main = () => {",
		"    const device = getDevice()",
		"    const speed: u16 = device.speed",
		"    const bad: u16 = device.wrong",
		"}",
	].join("\n");
	const errors = checkSource(source, DEVICE_LIBRARIES).errors;
	const unknownError = findUnknownMember(errors);
	return [
		expectEqual(
			"an unknown member of a library object type reports unknownMember",
			hasErrorCode(errors, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"the library unknownMember keeps the library type",
			unknownError?.params?.type,
			"Device",
		),
		expectEqual(
			"declared library object fields do not report unknownMember",
			errors.filter((error) => {
				return (
					error.code === ERROR_CODE.unknownMember &&
					error.params?.name === "speed"
				);
			}).length,
			0,
		),
	];
};

export const runMemberAccessChecks = () => {
	return [
		...checkUnknownArgumentMember(),
		checkKnownObjectMembers(),
		...checkUnknownMemberInOtherPositions(),
		...checkDanglingMemberAccess(),
		...checkLibraryObjectMembers(),
	];
};
