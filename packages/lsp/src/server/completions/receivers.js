import { AST_NODE, walk } from "embedito95-core";

// The parser leaves the property of a trailing member access empty (or reads the
// next token as it), so the receiver is located by the dot it belongs to instead
// of by the property name: the innermost member expression whose object ends on
// that dot line at or before it owns the access.
const WALK_SKIP_KEYS = ["loc", "typeAnnotation"];
const DOT_PARTIAL_PATTERN = /\.([a-zA-Z0-9_]*)$/;

const compareLocations = (left, right) => {
	if (left.line !== right.line) {
		return left.line - right.line;
	}

	return left.column - right.column;
};

const isDotInsideMember = (member, dotLocation) => {
	const start = member.loc?.start;
	const end = member.loc?.end;

	if (!start || !end) {
		return false;
	}

	return (
		compareLocations(start, dotLocation) <= 0 &&
		compareLocations(dotLocation, end) <= 0
	);
};

const getDotDistance = (member, dotLocation) => {
	const objectEnd = member.object?.loc?.end;

	if (!objectEnd || objectEnd.line !== dotLocation.line) {
		return null;
	}

	const distance = dotLocation.column - objectEnd.column;

	return distance >= 0 ? distance : null;
};

const isReceiverCandidate = (node, dotLocation) => {
	return (
		node.type === AST_NODE.memberExpression &&
		Boolean(node.object) &&
		isDotInsideMember(node, dotLocation) &&
		getDotDistance(node, dotLocation) !== null
	);
};

// The receiver at the dot is the candidate whose object ends closest to it, so
// nested accesses keep the whole left-hand expression (`a.b.` uses `a.b`).
const isCloserReceiverCandidate = (candidate, current, dotLocation) => {
	return (
		getDotDistance(candidate, dotLocation) <
		getDotDistance(current, dotLocation)
	);
};

const enterReceiverCandidate = (node, state) => {
	if (!isReceiverCandidate(node, state.dotLocation)) {
		return;
	}

	if (
		!state.candidate ||
		isCloserReceiverCandidate(node, state.candidate, state.dotLocation)
	) {
		state.candidate = node;
	}
};

export const findReceiverAtDot = (syntaxTree, dotLocation) => {
	const state = { dotLocation, candidate: null };

	walk(syntaxTree, {
		skipKeys: WALK_SKIP_KEYS,
		enter: (node) => {
			enterReceiverCandidate(node, state);
		},
	});

	return state.candidate?.object ?? null;
};

export const findDotReceiver = (syntaxTree, beforeCursor, position) => {
	const dotMatch = beforeCursor.match(DOT_PARTIAL_PATTERN);

	if (!dotMatch) {
		return null;
	}

	const dotColumn = beforeCursor.length - dotMatch[0].length + 1;
	const receiverNode = findReceiverAtDot(syntaxTree, {
		line: position.line + 1,
		column: dotColumn,
	});

	if (!receiverNode) {
		return null;
	}

	return {
		receiverNode,
		prefix: dotMatch[1].toLowerCase(),
	};
};
