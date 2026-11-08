import { runTestCompile } from "./compile-checks.js";

const { exitCode } = await runTestCompile();

process.exitCode = exitCode;
