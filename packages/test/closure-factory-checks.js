import { collectLibraryModuleInfo, parse, tokenize } from "embedito95-core";
// `transformClosureFactories` is codegen-internal (not part of the core package
// entry point), so the check imports it by path to exercise the conflict guard.
import { transformClosureFactories } from "../core/src/strategy-shared/closures.js";
import { expectEqual } from "./reporting.js";

const WRITER_AND_SCREEN_TYPES = [
	"type Writer = {",
	"    write: (value: i16) => void",
	"}",
	"type Screen = {",
	"    paint: () => void",
	"}",
];

const buildFactorySource = (firstValue, secondValue) => {
	return [
		...WRITER_AND_SCREEN_TYPES,
		"const makeA = (writer: Writer): Screen => {",
		"    const paint = () => {",
		`        writer.write(${firstValue})`,
		"    }",
		"    return { paint: paint }",
		"}",
		"const makeB = (writer: Writer): Screen => {",
		"    const paint = () => {",
		`        writer.write(${secondValue})`,
		"    }",
		"    return { paint: paint }",
		"}",
	].join("\n");
};

const getConflictMessage = (source) => {
	const { tokens } = tokenize(source);
	const { ast } = parse(tokens, source);
	const objectTypes = collectLibraryModuleInfo(source, "local").objectTypes;
	try {
		transformClosureFactories(ast, objectTypes);
		return null;
	} catch (error) {
		return error.message;
	}
};

const checkDifferentBodiesConflict = () => {
	const message = getConflictMessage(buildFactorySource(1, 2));
	return expectEqual(
		"closure factories returning identifier references with different bodies conflict",
		message,
		"Closure factory conflict: 'paint' of type 'Screen' is defined with different bodies by multiple factories. Factories of the same object type must share identical method logic.",
	);
};

const checkIdenticalBodiesDoNotConflict = () => {
	const message = getConflictMessage(buildFactorySource(1, 1));
	return expectEqual(
		"closure factories with identical bodies do not conflict",
		message,
		null,
	);
};

export const runClosureFactoryChecks = () => {
	return [checkDifferentBodiesConflict(), checkIdenticalBodiesDoNotConflict()];
};
