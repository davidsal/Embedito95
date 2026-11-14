import {
	buildSnapshotReport,
	checkSource,
	createLibraries,
	isMainModule,
	listSnapshots,
	renderFlagCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const SELF_REFERENCE_PATTERN =
	/objectSelfReference|self-reference|reference cycle/i;

const hasSelfReferenceDiagnostic = (errors) => {
	return errors.some((error) => {
		return SELF_REFERENCE_PATTERN.test(`${error.code ?? ""} ${error.message ?? ""}`);
	});
};

// Cycles are reclaimed at runtime by the trial-deletion collector, so the
// checker must not flag any of these programs. The snapshot pins that absence:
// every case reports `selfReference: no`.
const renderCase = ({ body, description }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	return renderFlagCase({
		description,
		label: "selfReference",
		flag: hasSelfReferenceDiagnostic(errors),
	});
};

const buildReport = () => {
	const cases = [
		{
			description: "type Node = { next: Node }; n.next = n -> accepted",
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
			description:
				"type Node = { next: Node | null }; n.next = n -> accepted",
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
			description: "n.next = m (a different Node, not self) -> accepted",
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
			description: "acyclic linked list a.next = b; b.next = null -> accepted",
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
			description: "indirect cycle a.next = b; b.next = a -> accepted",
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
			description: "scalar field self-name is not an object field -> accepted",
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
		"// Object reference cycles (handled by the runtime trial-deletion collector).",
		"// The checker emits no static diagnostic for 'obj.field = obj', whether the",
		"// field is the object's own type or nullable, and longer cycles are equally",
		"// accepted. Every case below must stay diagnostic-free.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listObjectCycleSnapshots = () => {
	return listSnapshots("object-cycle.txt", buildReport());
};

export const writeObjectCycleSnapshots = () => {
	writeSnapshots(listObjectCycleSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeObjectCycleSnapshots();
	console.log("Generated object-cycle.txt");
}
