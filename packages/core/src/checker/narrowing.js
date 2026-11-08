import {
	AST_NODE,
	DATA_TYPE,
	FLOAT_TYPES,
	QUOTE_DOUBLE,
	QUOTE_SINGLE,
} from "../constants.js";
import { collectBoundNames } from "./references-checks.js";
import { endsWithReturn } from "./statement-flow.js";
import {
	CHARACTER_TYPES,
	getNonNullableType,
	INTEGER_TYPES,
	isNullLiteralNode,
	rangeFitsWithin,
	TYPE_RANGES,
	unwrapParentheses,
} from "./types.js";

const analyzeNarrowingTest = (test, polarity) => {
	const node = unwrapParentheses(test);
	if (!node) {
		return [];
	}
	if (node.type === AST_NODE.binaryExpression) {
		if (node.operator === "&&") {
			return polarity
				? [
						...analyzeNarrowingTest(node.left, true),
						...analyzeNarrowingTest(node.right, true),
					]
				: [];
		}
		if (node.operator === "||") {
			return polarity
				? []
				: [
						...analyzeNarrowingTest(node.left, false),
						...analyzeNarrowingTest(node.right, false),
					];
		}
		if (node.operator !== "==" && node.operator !== "!=") {
			return [];
		}
		const nullOnLeft = isNullLiteralNode(node.left);
		const nullOnRight = isNullLiteralNode(node.right);
		if (nullOnLeft === nullOnRight) {
			return [];
		}
		const other = nullOnLeft ? node.right : node.left;
		if (other?.type !== AST_NODE.identifier) {
			return [];
		}
		const isEquality = node.operator === "==";
		return [{ name: other.name, isNotNull: isEquality ? !polarity : polarity }];
	}
	if (node.type === AST_NODE.unaryExpression && node.operator === "!") {
		return analyzeNarrowingTest(node.argument, !polarity);
	}
	if (node.type === AST_NODE.identifier) {
		return polarity ? [{ name: node.name, isNotNull: true }] : [];
	}
	return [];
};

const collectNonNullNarrowings = (test, polarity) => {
	return analyzeNarrowingTest(test, polarity).filter(
		(entry) => entry.isNotNull,
	);
};

const analyzeAfterNarrowings = (test) => {
	const node = unwrapParentheses(test);
	if (!node) {
		return [];
	}
	if (node.type === AST_NODE.unaryExpression && node.operator === "!") {
		const argument = unwrapParentheses(node.argument);
		return argument?.type === AST_NODE.identifier
			? [{ name: argument.name, isNotNull: true }]
			: [];
	}
	if (node.type === AST_NODE.binaryExpression && node.operator === "==") {
		const nullOnLeft = isNullLiteralNode(node.left);
		const nullOnRight = isNullLiteralNode(node.right);
		if (nullOnLeft === nullOnRight) {
			return [];
		}
		const other = nullOnLeft ? node.right : node.left;
		return other?.type === AST_NODE.identifier
			? [{ name: other.name, isNotNull: true }]
			: [];
	}
	return [];
};

const locWithin = (location, regionLocation) => {
	if (!location?.start || !regionLocation?.start) {
		return false;
	}
	const start = location.start;
	const end = location.end ?? location.start;
	const regionStart = regionLocation.start;
	const regionEnd = regionLocation.end ?? regionLocation.start;

	if (start.line < regionStart.line || start.line > regionEnd.line) {
		return false;
	}
	if (start.line === regionStart.line && start.column < regionStart.column) {
		return false;
	}
	if (end.line === regionEnd.line && end.column > regionEnd.column) {
		return false;
	}
	return true;
};

export const isNarrowedAt = (name, location, regions) => {
	return regions.some((region) => {
		return region.name === name && locWithin(location, region.loc);
	});
};

export const resolveNarrowedTypeAt = (
	variableTypes,
	narrowingRegions,
	name,
	location,
) => {
	const resolvedType = variableTypes.resolve(name, location);
	if (resolvedType && isNarrowedAt(name, location, narrowingRegions)) {
		return getNonNullableType(resolvedType);
	}
	return resolvedType;
};

export const createNarrowedTypeResolver = (variableTypes, narrowingRegions) => {
	const resolveNarrowedTypeAtLocation = (name, location) => {
		return resolveNarrowedTypeAt(
			variableTypes,
			narrowingRegions,
			name,
			location,
		);
	};
	return resolveNarrowedTypeAtLocation;
};

const pushNarrowingRegions = (regions, narrowings, loc) => {
	if (!loc) {
		return;
	}
	for (const narrowing of narrowings) {
		regions.push({ name: narrowing.name, loc });
	}
};

const isAssignmentToName = (node, name) => {
	if (node?.type === AST_NODE.assignmentExpression) {
		return node.left?.type === AST_NODE.identifier && node.left.name === name;
	}
	if (node?.type === AST_NODE.updateExpression) {
		return (
			node.argument?.type === AST_NODE.identifier && node.argument.name === name
		);
	}
	return false;
};

const findFirstAssignmentLocation = (node, name) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (
		node.type === AST_NODE.functionExpression &&
		collectBoundNames(node).has(name)
	) {
		return null;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			const location = findFirstAssignmentLocation(item, name);
			if (location) {
				return location;
			}
		}
		return null;
	}
	if (isAssignmentToName(node, name)) {
		return node.loc ?? null;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}
		const location = findFirstAssignmentLocation(value, name);
		if (location) {
			return location;
		}
	}
	return null;
};

const truncateRegionAtFirstAssignment = (loc, node, name) => {
	const assignmentLocation = findFirstAssignmentLocation(node, name);
	if (!assignmentLocation?.start || !loc?.start) {
		return loc;
	}
	return {
		start: loc.start,
		end: assignmentLocation.end ?? assignmentLocation.start,
	};
};

const pushBranchNarrowingRegions = (regions, narrowings, branchNode, loc) => {
	if (!loc) {
		return;
	}
	for (const narrowing of narrowings) {
		regions.push({
			name: narrowing.name,
			loc: truncateRegionAtFirstAssignment(loc, branchNode, narrowing.name),
		});
	}
};

const isTerminalStatement = (statement) => {
	return (
		statement?.type === AST_NODE.returnStatement ||
		statement?.type === AST_NODE.breakStatement
	);
};

const loopTestMayExit = (test) => {
	if (!test) {
		return false;
	}
	const node = unwrapParentheses(test);
	if (node?.type === AST_NODE.literal) {
		return node.value !== true;
	}
	return true;
};

const loopTestMayEnter = (test) => {
	if (!test) {
		return true;
	}
	const node = unwrapParentheses(test);
	if (node?.type === AST_NODE.literal) {
		return node.value !== false;
	}
	return true;
};

const keepBreakAssignment = (_statement, state) => {
	return state;
};

const advanceBreakAssignment = (statement, state, name) => {
	return state || statementFallsThroughWithAssignment(statement, name);
};

const sequenceReachesBreak = (
	statements,
	startIndex,
	state,
	advanceState,
	name,
) => {
	const statement = statements[startIndex];
	if (!statement) {
		return false;
	}
	if (statementReachesBreak(statement, state, advanceState, name)) {
		return true;
	}
	if (!statementMayFallThrough(statement)) {
		return false;
	}
	return sequenceReachesBreak(
		statements,
		startIndex + 1,
		advanceState(statement, state, name),
		advanceState,
		name,
	);
};

const statementReachesBreak = (statement, state, advanceState, name) => {
	if (!statement) {
		return false;
	}
	if (statement.type === AST_NODE.breakStatement) {
		return state;
	}
	if (statement.type === AST_NODE.blockStatement) {
		return sequenceReachesBreak(
			statement.body ?? [],
			0,
			state,
			advanceState,
			name,
		);
	}
	if (statement.type === AST_NODE.ifStatement) {
		return (
			statementReachesBreak(statement.consequent, state, advanceState, name) ||
			statementReachesBreak(statement.alternate, state, advanceState, name)
		);
	}
	return false;
};

const statementBreaksWithAssignment = (statement, name) => {
	return statementReachesBreak(statement, false, advanceBreakAssignment, name);
};

const statementReachesAnyBreak = (statement) => {
	return statementReachesBreak(statement, true, keepBreakAssignment, null);
};

const loopMayFallThrough = (statement) => {
	if (loopTestMayExit(statement.test)) {
		return true;
	}
	const testMayEnter =
		statement.type === AST_NODE.doWhileStatement ||
		loopTestMayEnter(statement.test);
	return testMayEnter && statementReachesAnyBreak(statement.body);
};

const loopFallsThroughWithAssignment = (statement, name) => {
	if (isAssignmentToName(statement.test, name)) {
		return true;
	}
	const testMayEnter =
		statement.type === AST_NODE.doWhileStatement ||
		loopTestMayEnter(statement.test);
	const testAllowsExit = loopTestMayExit(statement.test);
	const breakFallsThrough =
		testMayEnter && statementBreaksWithAssignment(statement.body, name);
	const loopCanExit = loopMayFallThrough(statement);
	const forInitAssigns =
		statement.type === AST_NODE.forStatement &&
		isAssignmentToName(statement.init, name) &&
		loopCanExit;
	const forUpdateAssigns =
		statement.type === AST_NODE.forStatement &&
		isAssignmentToName(statement.update, name) &&
		statementMayFallThrough(statement.body) &&
		loopCanExit;
	if (forInitAssigns || forUpdateAssigns) {
		return true;
	}
	if (!testAllowsExit) {
		return breakFallsThrough;
	}
	return (
		breakFallsThrough ||
		(testMayEnter && statementFallsThroughWithAssignment(statement.body, name))
	);
};

const statementsMayFallThrough = (statements) => {
	return statements.every((statement) => {
		return statementMayFallThrough(statement);
	});
};

const switchStatementsFallThroughWithAssignment = (
	cases,
	caseIndex,
	statementIndex,
	hasAssigned,
	name,
) => {
	const consequent = cases[caseIndex]?.consequent ?? [];
	const statement = consequent[statementIndex];
	if (!statement) {
		if (caseIndex + 1 >= cases.length) {
			return hasAssigned;
		}
		return switchStatementsFallThroughWithAssignment(
			cases,
			caseIndex + 1,
			0,
			hasAssigned,
			name,
		);
	}
	if (statement.type === AST_NODE.breakStatement) {
		return hasAssigned;
	}
	if (!statementMayFallThrough(statement)) {
		return false;
	}
	return switchStatementsFallThroughWithAssignment(
		cases,
		caseIndex,
		statementIndex + 1,
		hasAssigned || statementFallsThroughWithAssignment(statement, name),
		name,
	);
};

const switchFallsThroughWithAssignment = (statement, name) => {
	const cases = statement.cases ?? [];
	return cases.some((_switchCase, caseIndex) => {
		return switchStatementsFallThroughWithAssignment(
			cases,
			caseIndex,
			0,
			false,
			name,
		);
	});
};

const sequenceFallsThroughWithAssignment = (statements, startIndex, name) => {
	const statement = statements[startIndex];
	if (!statement) {
		return false;
	}
	if (
		statementMayFallThrough(statement) &&
		sequenceFallsThroughWithAssignment(statements, startIndex + 1, name)
	) {
		return true;
	}
	return (
		statementFallsThroughWithAssignment(statement, name) &&
		statementsMayFallThrough(statements.slice(startIndex + 1))
	);
};

const statementFallsThroughWithAssignment = (statement, name) => {
	if (!statement) {
		return false;
	}
	if (statement.type === AST_NODE.expressionStatement) {
		return isAssignmentToName(statement.expression, name);
	}
	if (statement.type === AST_NODE.blockStatement) {
		return sequenceFallsThroughWithAssignment(statement.body ?? [], 0, name);
	}
	if (statement.type === AST_NODE.ifStatement) {
		return (
			statementFallsThroughWithAssignment(statement.consequent, name) ||
			statementFallsThroughWithAssignment(statement.alternate, name)
		);
	}
	if (statement.type === AST_NODE.switchStatement) {
		return switchFallsThroughWithAssignment(statement, name);
	}
	if (
		statement.type === AST_NODE.whileStatement ||
		statement.type === AST_NODE.forStatement ||
		statement.type === AST_NODE.doWhileStatement
	) {
		return loopFallsThroughWithAssignment(statement, name);
	}
	return false;
};

const statementMayFallThrough = (statement) => {
	if (!statement) {
		return true;
	}
	if (isTerminalStatement(statement)) {
		return false;
	}
	if (statement.type === AST_NODE.blockStatement) {
		return statementsMayFallThrough(statement.body ?? []);
	}
	if (statement.type === AST_NODE.ifStatement) {
		if (!statement.alternate) {
			return true;
		}
		return (
			statementMayFallThrough(statement.consequent) ||
			statementMayFallThrough(statement.alternate)
		);
	}
	if (statement.type === AST_NODE.switchStatement) {
		return !endsWithReturn(statement);
	}
	if (
		statement.type === AST_NODE.whileStatement ||
		statement.type === AST_NODE.forStatement ||
		statement.type === AST_NODE.doWhileStatement
	) {
		return loopMayFallThrough(statement);
	}
	return true;
};

const resolveAfterRegionEnd = (body, statementIndex, name, fallbackEnd) => {
	const statementsAfter = body.slice(statementIndex + 1);
	const reassignmentLocation = findFirstAssignmentLocation(
		statementsAfter,
		name,
	);
	return (
		reassignmentLocation?.end ?? reassignmentLocation?.start ?? fallbackEnd
	);
};

const collectIfStatementNarrowings = (
	statement,
	body,
	statementIndex,
	regions,
) => {
	if (statement?.type !== AST_NODE.ifStatement) {
		return;
	}
	pushBranchNarrowingRegions(
		regions,
		collectNonNullNarrowings(statement.test, true),
		statement.consequent,
		statement.consequent?.loc,
	);
	pushBranchNarrowingRegions(
		regions,
		collectNonNullNarrowings(statement.test, false),
		statement.alternate,
		statement.alternate?.loc,
	);
	const after = analyzeAfterNarrowings(statement.test);
	if (
		after.length === 0 ||
		!statement.loc?.end ||
		!endsWithReturn(statement.consequent)
	) {
		return;
	}
	const fallbackEnd = body[body.length - 1]?.loc?.end ?? statement.loc.end;
	for (const narrowing of after) {
		if (
			statementFallsThroughWithAssignment(statement.alternate, narrowing.name)
		) {
			continue;
		}
		const regionEnd = resolveAfterRegionEnd(
			body,
			statementIndex,
			narrowing.name,
			fallbackEnd,
		);
		regions.push({
			name: narrowing.name,
			loc: { start: statement.loc.end, end: regionEnd },
		});
	}
};

const collectExpressionNarrowings = (node, regions) => {
	if (
		node?.type === AST_NODE.binaryExpression &&
		(node.operator === "&&" || node.operator === "||")
	) {
		pushNarrowingRegions(
			regions,
			collectNonNullNarrowings(node.left, node.operator === "&&"),
			node.right?.loc,
		);
	}
	if (node?.type === AST_NODE.conditionalExpression) {
		pushNarrowingRegions(
			regions,
			collectNonNullNarrowings(node.test, true),
			node.consequent?.loc,
		);
		pushNarrowingRegions(
			regions,
			collectNonNullNarrowings(node.test, false),
			node.alternate?.loc,
		);
	}
	if (node?.type === AST_NODE.whileStatement) {
		pushNarrowingRegions(
			regions,
			collectNonNullNarrowings(node.test, true),
			node.body?.loc,
		);
	}
};

const visitNarrowingNodes = (node, regions) => {
	if (node?.type === AST_NODE.blockStatement) {
		const body = node.body ?? [];
		for (let index = 0; index < body.length; index += 1) {
			collectIfStatementNarrowings(body[index], body, index, regions);
			visitNarrowingNodes(body[index], regions);
		}
		return;
	}
	collectExpressionNarrowings(node, regions);
	for (const [key, value] of Object.entries(node ?? {})) {
		if (key === "loc") {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				visitNarrowingNodes(item, regions);
			}
		} else if (value && typeof value === "object") {
			visitNarrowingNodes(value, regions);
		}
	}
};

export const collectNullNarrowing = (ast) => {
	const regions = [];
	visitNarrowingNodes(ast, regions);
	return regions;
};

export const literalMatchesType = (node, type) => {
	if (CHARACTER_TYPES.has(type)) {
		if (typeof node.value !== "string") {
			return false;
		}
		if (node.quote === QUOTE_SINGLE) {
			return type === DATA_TYPE.char;
		}
		if (node.quote === QUOTE_DOUBLE) {
			return type === DATA_TYPE.string;
		}
		return type === DATA_TYPE.string || node.value.length === 1;
	}
	if (FLOAT_TYPES.has(type)) {
		return typeof node.value === "number";
	}
	const range = TYPE_RANGES[type];
	if (!range) {
		return true;
	}
	if (typeof node.value !== "number" || !Number.isInteger(node.value)) {
		return false;
	}
	return node.value >= range.min && node.value <= range.max;
};

export const identifierMatchesType = (argumentType, type) => {
	const nonNullableType = getNonNullableType(argumentType);
	if (CHARACTER_TYPES.has(type)) {
		return nonNullableType === type;
	}
	if (FLOAT_TYPES.has(type)) {
		return (
			INTEGER_TYPES.has(nonNullableType) || FLOAT_TYPES.has(nonNullableType)
		);
	}
	if (!TYPE_RANGES[type]) {
		return true;
	}
	if (!INTEGER_TYPES.has(nonNullableType)) {
		return false;
	}
	const argumentRange = TYPE_RANGES[nonNullableType];
	const paramRange = TYPE_RANGES[type];
	return rangeFitsWithin(argumentRange, paramRange);
};
