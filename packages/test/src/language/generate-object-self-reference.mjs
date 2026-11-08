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

const LIBRARIES = createLibraries();

const renderCase = ({ body, description }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	return renderFlagCase({
		description,
		label: "objectSelfReference",
		flag: hasErrorCode(errors, ERROR_CODE.objectSelfReference),
	});
};

const buildReport = () => {
	const cases = [
		{
			description: "type Node = { next: Node }; n.next = n -> cycle error",
			body: [
				"type Node = {",
				"    next: Node",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    let n: Node",
				"    n.next = n",
				"}",
				"main()",
			],
		},
		{
			description: "type Node = { next: Node | null }; n.next = n -> cycle error",
			body: [
				"type Node = {",
				"    next: Node | null",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    let n: Node",
				"    n.next = n",
				"}",
				"main()",
			],
		},
		{
			description: "n.next = m (a different Node, not self) -> ok",
			body: [
				"type Node = {",
				"    next: Node",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    let n: Node",
				"    let m: Node",
				"    n.next = m",
				"}",
				"main()",
			],
		},
		{
			description: "acyclic linked list a.next = b; b.next = null -> ok",
			body: [
				"type Node = {",
				"    next: Node | null",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    let a: Node",
				"    let b: Node",
				"    a.next = b",
				"    b.next = null",
				"}",
				"main()",
			],
		},
		{
			description: "indirect cycle a.next = b; b.next = a -> not detected (ok)",
			body: [
				"type Node = {",
				"    next: Node | null",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    let a: Node",
				"    let b: Node",
				"    a.next = b",
				"    b.next = a",
				"}",
				"main()",
			],
		},
		{
			description: "scalar field self-name is not an object field -> ok",
			body: [
				"type Pair = {",
				"    value: i16",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    let pair: Pair",
				"    pair.value = pair.value + 1",
				"}",
				"main()",
			],
		},
	];

	const header = [
		"// Direct object self-reference guard (refcount has no GC).",
		"// 'obj.field = obj' where the field holds the object's own type must emit",
		"// error.objectSelfReference (a length-1 reference cycle), including when the",
		"// field is nullable. Assigning a DIFFERENT instance, building an acyclic",
		"// linked list, or forming an indirect cycle across variables must not flag;",
		"// indirect cycles are a documented restriction that leaks memory.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listObjectSelfReferenceSnapshots = () => {
	return listSnapshots("object-self-reference.txt", buildReport());
};

export const writeObjectSelfReferenceSnapshots = () => {
	writeSnapshots(listObjectSelfReferenceSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeObjectSelfReferenceSnapshots();
	console.log("Generated object-self-reference.txt");
}
