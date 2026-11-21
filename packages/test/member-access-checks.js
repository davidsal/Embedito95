import { ERROR_CODE, parse, tokenize } from "embedito95-core";
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

const ANONYMOUS_PERSONA_DECLARATIONS = [
	'const getAnonymousPersona = () => { return { name: "david", age: 31, address: { city: "Madrid" } } }',
	"const probandoTexto = (value: string) => {}",
	"const probandoEdad = (value: i32) => {}",
];

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

const checkAnonymousPersonaBody = (bodyLines) => {
	const source = [
		...ANONYMOUS_PERSONA_DECLARATIONS,
		"const main = () => {",
		"    const persona = getAnonymousPersona()",
		...bodyLines,
		"}",
	].join("\n");
	return checkSource(source, LIBRARIES).errors;
};

const parseForChecks = (source) => {
	const { tokens } = tokenize(source);
	return parse(tokens);
};

const memberPropertyName = (memberExpression) => {
	return memberExpression?.property?.name;
};

const diagnosticPosition = (diagnostic) => {
	return `${diagnostic?.location?.start?.line}:${diagnostic?.location?.start?.column}`;
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
		`    probandoTexto(\`\${persona.name}\`)`,
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

const checkDanglingMemberSyntaxErrors = () => {
	const templateResult = parseForChecks(`const a = \`\${persona.}\``);
	const statementResult = parseForChecks(
		["const nombre = persona.", "const otro = 1"].join("\n"),
	);
	const eofResult = parseForChecks("persona.");
	return [
		expectEqual(
			"a dangling member inside a template reports a syntax error at the dot",
			`${templateResult.errors[0]?.code}@${diagnosticPosition(templateResult.errors[0])}`,
			`${ERROR_CODE.unexpectedToken}@1:21`,
		),
		expectEqual(
			"a dangling template keeps the dot and does not consume another token",
			memberPropertyName(
				templateResult.ast.body[0].declarations[0].init.expressions[0],
			),
			"",
		),
		expectEqual(
			"a dangling initializer before another statement reports a syntax error at the dot",
			`${statementResult.errors[0]?.code}@${diagnosticPosition(statementResult.errors[0])}`,
			`${ERROR_CODE.unexpectedToken}@1:23`,
		),
		expectEqual(
			"the statement after a dangling initializer is parsed separately",
			`${statementResult.ast.body.length}:${statementResult.ast.body[1]?.declarations[0]?.id?.name}`,
			"2:otro",
		),
		expectEqual(
			"a dangling initializer does not take the next statement keyword as a member",
			memberPropertyName(statementResult.ast.body[0].declarations[0].init),
			"",
		),
		expectEqual(
			"a dangling member at EOF reports a syntax error at the dot",
			`${eofResult.errors[0]?.code}@${diagnosticPosition(eofResult.errors[0])}`,
			`${ERROR_CODE.unexpectedToken}@1:8`,
		),
	];
};

const checkValidMemberChainsParseCleanly = () => {
	const sources = [
		"const a = persona.name",
		"const a = a.b.c",
		`const a = \`\${persona.name}\``,
	];
	const errorCounts = sources.map((source) => {
		return parseForChecks(source).errors.length;
	});
	return expectEqual(
		"valid member access chains parse without diagnostics",
		errorCounts.join(","),
		"0,0,0",
	);
};

const checkAnonymousShapeUnknownMember = () => {
	const argumentErrors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.noExiste)",
	]);
	const initializerErrors = checkAnonymousPersonaBody([
		"    const nombre = persona.noExiste",
	]);
	const bareErrors = checkAnonymousPersonaBody(["    persona.noExiste"]);
	const unknownError = findUnknownMember(argumentErrors);
	return [
		expectEqual(
			"an unknown property of an anonymous shape reports unknownMember as an argument",
			hasErrorCode(argumentErrors, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"anonymous shape unknownMember keeps the property name",
			unknownError?.params?.name,
			"noExiste",
		),
		expectEqual(
			"anonymous shape unknownMember reports the shape type",
			typeof unknownError?.params?.type === "string" &&
				unknownError.params.type.startsWith("object:"),
			true,
		),
		expectEqual(
			"anonymous shape unknownMember points at the property",
			`${unknownError?.location?.start?.line}:${unknownError?.location?.start?.column}`,
			"6:27",
		),
		expectEqual(
			"an unknown anonymous shape property in an initializer reports unknownMember",
			hasErrorCode(initializerErrors, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"a bare unknown anonymous shape property reports unknownMember",
			hasErrorCode(bareErrors, ERROR_CODE.unknownMember),
			true,
		),
	];
};

const checkAnonymousShapeKnownMembers = () => {
	const errors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.name)",
		"    probandoEdad(persona.age)",
	]);
	return expectEqual(
		"declared anonymous shape fields do not report unknownMember",
		hasErrorCode(errors, ERROR_CODE.unknownMember),
		false,
	);
};

const checkAnonymousShapeDanglingMemberAccess = () => {
	const danglingStatement = checkAnonymousPersonaBody(["    persona."]);
	const danglingInitializer = checkAnonymousPersonaBody([
		"    const nombre = persona.",
	]);
	const danglingTemplate = checkAnonymousPersonaBody([
		`    probandoTexto(\`\${persona.}\`)`,
	]);
	return [
		expectEqual(
			"a dangling anonymous shape member statement reports expectedStatement",
			hasErrorCode(danglingStatement, ERROR_CODE.expectedStatement),
			true,
		),
		expectEqual(
			"a dangling anonymous shape member statement does not invent unknownMember",
			hasErrorCode(danglingStatement, ERROR_CODE.unknownMember),
			false,
		),
		expectEqual(
			"a dangling anonymous shape member initializer does not break the checker",
			Array.isArray(danglingInitializer) &&
				!hasErrorCode(danglingInitializer, ERROR_CODE.unknownMember),
			true,
		),
		expectEqual(
			"a dangling anonymous shape member inside a template does not invent unknownMember",
			hasErrorCode(danglingTemplate, ERROR_CODE.unknownMember),
			false,
		),
	];
};

const checkAnonymousShapeNestedMembers = () => {
	const validErrors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.address.city)",
	]);
	const invalidErrors = checkAnonymousPersonaBody([
		"    probandoTexto(persona.address.zip)",
	]);
	const unknownError = findUnknownMember(invalidErrors);
	return [
		expectEqual(
			"a nested anonymous shape field does not report unknownMember",
			hasErrorCode(validErrors, ERROR_CODE.unknownMember),
			false,
		),
		expectEqual(
			"an unknown nested anonymous shape field reports unknownMember",
			unknownError?.params?.name,
			"zip",
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
		...checkDanglingMemberSyntaxErrors(),
		checkValidMemberChainsParseCleanly(),
		...checkAnonymousShapeUnknownMember(),
		checkAnonymousShapeKnownMembers(),
		...checkAnonymousShapeDanglingMemberAccess(),
		...checkAnonymousShapeNestedMembers(),
		...checkLibraryObjectMembers(),
	];
};
