import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const CONSOLE_PACKAGE = "@embedito95/console";
const CONSOLE_LIBRARY_PATH = join(
	CORE_LIBRARY_DIRECTORY,
	"console",
	"main.e95",
);

const buildReport = () => {
	const context = readLibraryContext({
		libraryPath: CONSOLE_LIBRARY_PATH,
		packageName: CONSOLE_PACKAGE,
	});
	const cases = [
		{
			label: "console.log accepts every documented value type",
			probes: [],
			body: `import { console } from '@embedito95/console'
export const show = (text: string, letter: char, small: u8, signedSmall: i8, medium: u16, signedMedium: i16, wide: u32, signedWide: i32, huge: u64, signedHuge: i64, real: f32, doubleReal: f64, flag: boolean) => {
    console.log(text)
    console.log(letter)
    console.log(small)
    console.log(signedSmall)
    console.log(medium)
    console.log(signedMedium)
    console.log(wide)
    console.log(signedWide)
    console.log(huge)
    console.log(signedHuge)
    console.log(real)
    console.log(doubleReal)
    console.log(flag)
}`,
		},
		{
			label: "console.log accepts null and string | null values",
			probes: [],
			body: `import { console } from '@embedito95/console'
export const showMissing = (label: string | null) => {
    console.log(label)
    console.log(null)
}`,
		},
		{
			label: "wrong argument count is reported",
			probes: ["show"],
			body: `import { console } from '@embedito95/console'
export const show = () => {
    console.log()
}`,
		},
		{
			label: "unknown console export is reported",
			probes: ["missing"],
			body: `import { logger } from '@embedito95/console'
export const missing = logger`,
		},
	];

	const header = [
		"// LSP view of the `console` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/console/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listConsoleLibrarySnapshots = () => {
	return listSnapshots("console-library.txt", buildReport());
};

export const writeConsoleLibrarySnapshots = () => {
	writeSnapshots(listConsoleLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeConsoleLibrarySnapshots();
	console.log("Generated console-library.txt");
}
