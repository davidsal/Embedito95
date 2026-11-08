import { green, writeLine } from "../console.js";
import { run as build } from "./build/index.js";
import { run as compile } from "./compile.js";
import { run as upload } from "./upload.js";

export const run = async () => {
	await build();
	await compile();
	await upload();
	writeLine(`${green("✔")} Flash complete`);
};
