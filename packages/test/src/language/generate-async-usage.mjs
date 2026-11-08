import { ERROR_CODE } from "embedito95-core";
import {
	checkSource,
	createLibraries,
	isMainModule,
	listSnapshots,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const ASYNC_PACKAGE = "@embedito95/async";

const LIBRARIES = createLibraries({
	knownLibraries: new Set([ASYNC_PACKAGE]),
	libraryExports: {
		[ASYNC_PACKAGE]: new Set(["sleep", "sleepMicros"]),
	},
	libraryFunctions: {
		[ASYNC_PACKAGE]: {
			sleep: {
				params: [{ name: "milliseconds", type: "u32", defaultValue: null }],
				returnType: "AsyncTask",
			},
			sleepMicros: {
				params: [{ name: "microseconds", type: "u32" }],
				returnType: "AsyncTask",
			},
		},
	},
});

const PROGRAM_SUFFIX = [
	"const setup = () => {}",
	"const main = () => { setup() }",
	"main()",
	"",
].join("\n");

const ASYNC_IMPORT = `import { sleep, sleepMicros } from '${ASYNC_PACKAGE}'`;

const RELEVANT_CODES = [
	ERROR_CODE.missingAwait,
	ERROR_CODE.asyncBuiltinOutsideAsync,
	ERROR_CODE.awaitOutsideAsync,
];

const renderCase = ({
	description,
	importLine = ASYNC_IMPORT,
	body,
	extra = [],
}) => {
	const source = [importLine, ...extra, PROGRAM_SUFFIX, body, ""].join("\n");
	const { errors } = checkSource(source, LIBRARIES);
	const codes = errors
		.filter((error) => {
			return RELEVANT_CODES.includes(error.code);
		})
		.map((error) => {
			return error.code;
		});
	return [
		`// ${description}`,
		`codes: ${codes.length > 0 ? codes.join(", ") : "ok"}`,
		"",
	].join("\n");
};

const buildReport = () => {
	const cases = [
		{
			description: "sleep without await inside a non-async function -> outside async",
			body: "const f = () => { sleep(10) }",
		},
		{
			description: "sleep without await inside an async function -> missing await",
			body: "const f = async () => { sleep(10) }",
		},
		{
			description: "await sleep inside an async function -> ok",
			body: "const f = async () => { await sleep(10) }",
		},
		{
			description: "await sleep inside a non-async function -> await outside async",
			body: "const f = () => { await sleep(10) }",
		},
		{
			description: "sleepMicros without await inside a non-async function -> outside async",
			body: "const f = () => { sleepMicros(10) }",
		},
		{
			description: "sleepMicros without await inside an async function -> missing await",
			body: "const f = async () => { sleepMicros(10) }",
		},
		{
			description: "await sleepMicros inside an async function -> ok",
			body: "const f = async () => { await sleepMicros(10) }",
		},
		{
			description: "sleep assigned without await inside an async function -> missing await",
			body: "const f = async () => { const task = sleep(10) }",
		},
		{
			description: "sleep assigned with await inside an async function -> ok",
			body: "const f = async () => { const task = await sleep(10) }",
		},
		{
			description: "sleep nested in a call without await inside an async function -> missing await",
			body: "const f = async () => { consume(sleep(10)) }",
			extra: ["const consume = (task: AsyncTask) => {}"],
		},
		{
			description: "sleep aliased on import without await inside an async function -> missing await",
			importLine: `import { sleep as delay } from '${ASYNC_PACKAGE}'`,
			body: "const f = async () => { delay(10) }",
		},
		{
			description: "user-defined sleep without the async import -> ok",
			importLine: "const sleep = (ms: u32) => {}",
			body: "const f = () => { sleep(10) }",
		},
	];

	const header = [
		"// Calls to the core async timing builtins (`sleep`, `sleepMicros`) must be",
		"// awaited and can only appear inside an `async` function.",
		"// `missingAwait` = called in async without `await`.",
		"// `asyncBuiltinOutsideAsync` = called (without await) in a non-async function.",
		"// Awaited calls in a non-async function report the pre-existing `awaitOutsideAsync`.",
		"",
	];

	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const listAsyncUsageSnapshots = () => {
	return listSnapshots("async-usage.txt", buildReport());
};

export const writeAsyncUsageSnapshots = () => {
	writeSnapshots(listAsyncUsageSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeAsyncUsageSnapshots();
	console.log("Generated async-usage.txt");
}
