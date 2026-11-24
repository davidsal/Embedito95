import { DATA_TYPE, FLOAT_TYPES, INTEGER_WIDTHS } from "../constants.js";
import { normalizeOperandTypes } from "./operators.js";
import { applyWordMinimum } from "./type-resolution.js";
import {
	INTEGER_TYPES,
	rangeFitsWithin,
	SIGNED_INTEGER_TYPES,
	TYPE_RANGES,
} from "./types.js";

// The largest integer magnitude an `f32` represents exactly (2^24). Beyond it,
// converting an integer range to `f32` can lose low-order digits.
const FLOAT32_EXACT_INTEGER_LIMIT = 2 ** 24;

// Conversion scores: lower wins. A signature is always usable for every
// argument (numeric conversions are allowed), but the closest one is chosen so
// an overloaded core function keeps the argument width instead of narrowing it.
const EXACT_SCORE = 0;
const WIDENING_SCORE = 1;
const NARROWING_SCORE = 2;
const NON_VIABLE_SCORE = null;

const integerFitsExactlyInFloat32 = (integerType) => {
	const range = TYPE_RANGES[integerType];
	return Boolean(
		range &&
			range.min >= -FLOAT32_EXACT_INTEGER_LIMIT &&
			range.max <= FLOAT32_EXACT_INTEGER_LIMIT,
	);
};

// The float type that preserves the full range of an integer type: `f32` when
// every value is exactly representable, `f64` otherwise.
export const resolveFloatTypeForIntegerType = (integerType) => {
	return integerFitsExactlyInFloat32(integerType)
		? DATA_TYPE.f32
		: DATA_TYPE.f64;
};

// Scored per direction: an integer value always widens into `f64` (binary64
// holds every integer the source can represent without losing digits), while
// into `f32` it only widens when its full range is exactly representable.
const scoreFloatConversion = (sourceType, targetType) => {
	if (sourceType === targetType) {
		return EXACT_SCORE;
	}
	if (INTEGER_TYPES.has(sourceType)) {
		if (targetType === DATA_TYPE.f64) {
			return WIDENING_SCORE;
		}
		return integerFitsExactlyInFloat32(sourceType)
			? WIDENING_SCORE
			: NARROWING_SCORE;
	}
	return targetType === DATA_TYPE.f64 ? WIDENING_SCORE : NARROWING_SCORE;
};

// The direction of the conversion decides the score: a source whose whole
// range fits the target widens, anything else narrows. `TYPE_RANGES` models a
// `u64` as unbounded (its real maximum is past the exact JS range), so a `u64`
// never fits a signed target and always scores as narrowing. A `u32` does fit
// `i64`, so it widens there and narrows into `i32`.
const scoreIntegerConversion = (sourceType, targetType) => {
	if (sourceType === targetType) {
		return EXACT_SCORE;
	}
	if (!TYPE_RANGES[sourceType] || !TYPE_RANGES[targetType]) {
		return NON_VIABLE_SCORE;
	}
	return rangeFitsWithin(TYPE_RANGES[sourceType], TYPE_RANGES[targetType])
		? WIDENING_SCORE
		: NARROWING_SCORE;
};

const scoreParameterConversion = (sourceType, targetType) => {
	if (!sourceType || !targetType) {
		return EXACT_SCORE;
	}
	if (sourceType === targetType) {
		return EXACT_SCORE;
	}
	if (FLOAT_TYPES.has(targetType)) {
		return FLOAT_TYPES.has(sourceType) || INTEGER_TYPES.has(sourceType)
			? scoreFloatConversion(sourceType, targetType)
			: NON_VIABLE_SCORE;
	}
	if (INTEGER_TYPES.has(targetType)) {
		return INTEGER_TYPES.has(sourceType)
			? scoreIntegerConversion(sourceType, targetType)
			: NON_VIABLE_SCORE;
	}
	return NON_VIABLE_SCORE;
};

// The integer family does not use the additive score. A function such as
// `clamp` takes every argument at the same width, so the width comes from the
// same promotion the binary operators apply (`normalizeOperandTypes` in
// operators.js): arithmetic arguments are promoted pairwise to their common
// width, then the word minimum of the target applies. Selection is therefore
// "choose the signature whose width equals the promoted width", not "sum the
// per-argument conversion costs". That is why one `u32` argument forces `i64`
// in `clamp(u32, i32, i32)` even when the cheap `i32` signature wins the sum.
const isUniformIntegerSignature = (signature) => {
	const types = (signature?.params ?? []).map((param) => {
		return param.type;
	});
	if (types.length === 0) {
		return false;
	}
	return types.every((type) => {
		return INTEGER_TYPES.has(type) && type === types[0];
	});
};

const isIntegerPromotionDefinition = (signatures) => {
	return signatures.every(isUniformIntegerSignature);
};

const promoteIntegerArguments = (argumentTypes, wordSize) => {
	if (argumentTypes.length === 0) {
		return null;
	}
	// Fold the raw argument types first and apply the word minimum once, at the
	// end. Running `applyWordMinimum` on the initial operand before folding makes
	// the result depend on argument order: a leading `u8` would become `i32` and
	// then lose to a later `u32`, while `u32` first would stay unsigned.
	let promoted = argumentTypes[0];
	for (let index = 1; index < argumentTypes.length; index++) {
		promoted = normalizeOperandTypes(
			promoted,
			argumentTypes[index],
			"+",
			wordSize,
		);
	}
	return applyWordMinimum(promoted, wordSize);
};

// Same width wins first. Without an exact width (a `u64` argument has no
// signature), the cheapest signature whose range still holds the promoted type
// wins, and the widest signed form is the last resort.
const isCheaperIntegerSignature = (candidate, current) => {
	const candidateType = candidate.params[0].type;
	const currentType = current.params[0].type;
	const candidateWidth = INTEGER_WIDTHS[candidateType];
	const currentWidth = INTEGER_WIDTHS[currentType];
	if (candidateWidth !== currentWidth) {
		return candidateWidth < currentWidth;
	}
	return (
		SIGNED_INTEGER_TYPES.has(candidateType) &&
		!SIGNED_INTEGER_TYPES.has(currentType)
	);
};

const pickCheapestIntegerSignature = (signatures) => {
	return signatures.reduce((selected, signature) => {
		if (!selected) {
			return signature;
		}
		return isCheaperIntegerSignature(signature, selected)
			? signature
			: selected;
	}, null);
};

const selectPromotedIntegerSignature = (
	signatures,
	argumentTypes,
	wordSize,
) => {
	const promoted = promoteIntegerArguments(argumentTypes, wordSize);
	if (!promoted || !INTEGER_TYPES.has(promoted)) {
		return null;
	}
	const exact = signatures.find((signature) => {
		return signature.params.every((param) => {
			return param.type === promoted;
		});
	});
	if (exact) {
		return exact;
	}
	const fitting = signatures.filter((signature) => {
		return rangeFitsWithin(
			TYPE_RANGES[promoted],
			TYPE_RANGES[signature.params[0].type],
		);
	});
	if (fitting.length > 0) {
		return pickCheapestIntegerSignature(fitting);
	}
	const signedWide = signatures.find((signature) => {
		return signature.params[0].type === DATA_TYPE.i64;
	});
	return signedWide ?? pickCheapestIntegerSignature(signatures);
};

// The float family follows the same idea. Every argument shares one float
// width, and the width is the widest one that accepts all of them without
// losing range: one `f64` argument is enough to select `f64` (the rest widen
// with an explicit cast), while an all-`f32` call (or integers that fit `f32`
// exactly) stays `f32`. This replaces the additive score, where a lone `f64`
// could lose against `f32` after several cheap literal conversions.
const isUniformFloatSignature = (signature) => {
	const types = (signature?.params ?? []).map((param) => {
		return param.type;
	});
	if (types.length === 0) {
		return false;
	}
	return types.every((type) => {
		return FLOAT_TYPES.has(type) && type === types[0];
	});
};

const isFloatPromotionDefinition = (signatures) => {
	return signatures.every(isUniformFloatSignature);
};

const floatWidthForArgument = (type) => {
	if (type === DATA_TYPE.f32 || type === DATA_TYPE.f64) {
		return type;
	}
	if (INTEGER_TYPES.has(type)) {
		return resolveFloatTypeForIntegerType(type);
	}
	return null;
};

const promoteFloatArguments = (argumentTypes) => {
	if (argumentTypes.length === 0) {
		return null;
	}
	for (const type of argumentTypes) {
		const width = floatWidthForArgument(type);
		if (!width) {
			return null;
		}
		if (width === DATA_TYPE.f64) {
			return DATA_TYPE.f64;
		}
	}
	return DATA_TYPE.f32;
};

const selectPromotedFloatSignature = (signatures, argumentTypes) => {
	const promoted = promoteFloatArguments(argumentTypes);
	if (!promoted) {
		return null;
	}
	return (
		signatures.find((signature) => {
			return signature.params.every((param) => {
				return param.type === promoted;
			});
		}) ?? null
	);
};

const hasMissingRequiredParameter = (signature, argumentCount) => {
	const params = signature?.params ?? [];
	if (argumentCount > params.length) {
		return true;
	}
	for (let index = argumentCount; index < params.length; index++) {
		if (!params[index].defaultValue) {
			return true;
		}
	}
	return false;
};

const scoreSignature = (signature, argumentTypes) => {
	if (hasMissingRequiredParameter(signature, argumentTypes.length)) {
		return NON_VIABLE_SCORE;
	}
	let total = EXACT_SCORE;
	for (let index = 0; index < argumentTypes.length; index++) {
		const score = scoreParameterConversion(
			argumentTypes[index],
			signature.params[index]?.type,
		);
		if (score === NON_VIABLE_SCORE) {
			return NON_VIABLE_SCORE;
		}
		total += score;
	}
	return total;
};

export const getFunctionSignatures = (definition) => {
	if (!definition) {
		return [];
	}
	if (
		Array.isArray(definition.signatures) &&
		definition.signatures.length > 0
	) {
		return definition.signatures;
	}
	return [definition];
};

const countNarrowingConversions = (signature, argumentTypes) => {
	let count = 0;
	for (let index = 0; index < argumentTypes.length; index++) {
		const score = scoreParameterConversion(
			argumentTypes[index],
			signature.params[index]?.type,
		);
		if (score === NARROWING_SCORE) {
			count++;
		}
	}
	return count;
};

// Picks the overload whose parameter types best match the argument types.
// Integer and float families first go through their promotion rule described
// above: the selected signature is the one whose width holds every argument
// without losing range. Anything else (and a leftover tie) keeps the additive
// score with source order as the last tie-breaker, so a library that declares
// `f32` first resolves an unknown/ambiguous argument to `f32`.
export const resolveOverloadSignature = (
	definition,
	argumentTypes = [],
	wordSize = 0,
) => {
	const signatures = getFunctionSignatures(definition);
	if (signatures.length === 0) {
		return null;
	}
	if (signatures.length === 1) {
		return signatures[0];
	}

	if (
		isIntegerPromotionDefinition(signatures) &&
		argumentTypes.length === signatures[0].params.length &&
		argumentTypes.every((type) => {
			return INTEGER_TYPES.has(type);
		})
	) {
		const promoted = selectPromotedIntegerSignature(
			signatures,
			argumentTypes,
			wordSize,
		);
		if (promoted) {
			return promoted;
		}
	}

	if (
		isFloatPromotionDefinition(signatures) &&
		argumentTypes.length === signatures[0].params.length
	) {
		const promoted = selectPromotedFloatSignature(signatures, argumentTypes);
		if (promoted) {
			return promoted;
		}
	}

	let selected = null;
	let selectedScore = Number.POSITIVE_INFINITY;
	let selectedNarrowingCount = Number.POSITIVE_INFINITY;
	for (const signature of signatures) {
		const score = scoreSignature(signature, argumentTypes);
		if (score === NON_VIABLE_SCORE) {
			continue;
		}
		const narrowingCount = countNarrowingConversions(signature, argumentTypes);
		const improvesScore = score < selectedScore;
		const improvesNarrowing =
			score === selectedScore && narrowingCount < selectedNarrowingCount;
		if (!improvesScore && !improvesNarrowing) {
			continue;
		}
		selected = signature;
		selectedScore = score;
		selectedNarrowingCount = narrowingCount;
	}
	return selected ?? signatures[0];
};

export const resolveDefinitionReturnType = (
	definition,
	argumentTypes = [],
	wordSize = 0,
) => {
	const signature = resolveOverloadSignature(
		definition,
		argumentTypes,
		wordSize,
	);
	if (signature?.returnType) {
		return signature.returnType;
	}
	return definition?.returnType ?? null;
};

export const sameParameterTypeList = (leftParams = [], rightParams = []) => {
	if (leftParams.length !== rightParams.length) {
		return false;
	}
	return leftParams.every((param, index) => {
		return (param?.type ?? null) === (rightParams[index]?.type ?? null);
	});
};

export const buildFunctionSignature = (initializer) => {
	return {
		params: initializer.params.map((param) => ({
			name: param.name,
			type: param.typeAnnotation?.type ?? null,
			functionType: param.typeAnnotation?.functionType ?? null,
			defaultValue: param.defaultValue ?? null,
		})),
		returnType: initializer.returnType?.name ?? DATA_TYPE.void,
	};
};

export const hasRegisteredSignature = (definition, signature) => {
	return getFunctionSignatures(definition).some((candidate) => {
		return (
			sameParameterTypeList(candidate.params, signature.params) &&
			(candidate.returnType ?? null) === (signature.returnType ?? null)
		);
	});
};

// A core library may declare the same name twice when the parameter-type lists
// differ; any other duplicate (same signature, or a non-core module) is still a
// `duplicateDeclaration`.
export const isDistinctCoreLibrarySignature = (state, name, signature) => {
	if (!state.isCoreLibrary) {
		return false;
	}
	const existing = state.functionDefinitions[name];
	if (!existing) {
		return false;
	}
	return getFunctionSignatures(existing).every((candidate) => {
		return !sameParameterTypeList(candidate.params, signature.params);
	});
};
