import { ERROR_CODE } from "embedito95-core";
import {
	buildSnapshotReport,
	checkSource,
	createLibraries,
	isMainModule,
	listSnapshots,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const MEMBER_SEPARATOR = ", ";

const renderCase = ({ body, description }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	const switches = errors.filter((error) => {
		return error.code === ERROR_CODE.nonExhaustiveSwitch;
	});
	const missing = switches.flatMap((error) => {
		return error.params.members.split(MEMBER_SEPARATOR);
	});
	return [
		`// ${description}`,
		`nonExhaustiveSwitch: ${switches.length > 0 ? "yes" : "no"}`,
		`missing: ${missing.length > 0 ? missing.join(MEMBER_SEPARATOR) : "-"}`,
		"",
	].join("\n");
};

const buildReport = () => {
	const cases = [
		{
			description:
				"enum switch without default missing BLUE -> non-exhaustive",
			body: [
				"enum Color { RED, GREEN, BLUE }",
				"const setup = () => {}",
				"const pick = (c: Color): u8 => {",
				"    switch (c) {",
				"        case Color.RED:",
				"            return 1",
				"        case Color.GREEN:",
				"            return 2",
				"    }",
				"    return 0",
				"}",
				"const main = () => {",
				"    setup()",
				"    pick(Color.RED)",
				"}",
				"main()",
			],
		},
		{
			description:
				"enum switch without default missing BLUE and SLEEP -> non-exhaustive",
			body: [
				"enum Color { RED, GREEN, BLUE, SLEEP }",
				"const setup = () => {}",
				"const pick = (c: Color): u8 => {",
				"    switch (c) {",
				"        case Color.RED:",
				"            return 1",
				"        case Color.GREEN:",
				"            return 2",
				"    }",
				"    return 0",
				"}",
				"const main = () => {",
				"    setup()",
				"    pick(Color.RED)",
				"}",
				"main()",
			],
		},
		{
			description:
				"enum switch with default but missing BLUE -> ok (TS-like)",
			body: [
				"enum Color { RED, GREEN, BLUE }",
				"const setup = () => {}",
				"const pick = (c: Color): u8 => {",
				"    switch (c) {",
				"        case Color.RED:",
				"            return 1",
				"        default:",
				"            return 0",
				"    }",
				"}",
				"const main = () => {",
				"    setup()",
				"    pick(Color.RED)",
				"}",
				"main()",
			],
		},
		{
			description: "enum switch covering all cases -> ok",
			body: [
				"enum Color { RED, GREEN, BLUE }",
				"const setup = () => {}",
				"const pick = (c: Color): u8 => {",
				"    switch (c) {",
				"        case Color.RED:",
				"            return 1",
				"        case Color.GREEN:",
				"            return 2",
				"        case Color.BLUE:",
				"            return 3",
				"    }",
				"}",
				"const main = () => {",
				"    setup()",
				"    pick(Color.RED)",
				"}",
				"main()",
			],
		},
		{
			description:
				"switch on non-enum (u8) without default -> ok (not checkable)",
			body: [
				"const setup = () => {}",
				"const pick = (value: u8): u8 => {",
				"    switch (value) {",
				"        case 1:",
				"            return 1",
				"    }",
				"    return 0",
				"}",
				"const main = () => {",
				"    setup()",
				"    pick(1)",
				"}",
				"main()",
			],
		},
	];

	const header = [
		"// Switch exhaustiveness on enum discriminants (TS-like).",
		"// A switch over an enum without a 'default' must cover every member;",
		"// a 'default' satisfies exhaustiveness. Non-enum discriminants are not",
		"// checked. Emits error.nonExhaustiveSwitch.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listSwitchExhaustivenessSnapshots = () => {
	return listSnapshots("switch-exhaustiveness.txt", buildReport());
};

export const writeSwitchExhaustivenessSnapshots = () => {
	writeSnapshots(listSwitchExhaustivenessSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeSwitchExhaustivenessSnapshots();
	console.log("Generated switch-exhaustiveness.txt");
}
