export { UNRESOLVED_TYPE } from "../constants.js";
export { resolveArrayMethod } from "./array-methods.js";
export {
	inferArrayElementType,
	parseArrayType,
} from "./arrays.js";
export {
	ASYNC_TASK_TYPE_NAME,
	createAsyncTaskType,
	isAsyncTaskType,
	parseAsyncTaskType,
	stripTypeArguments,
	unwrapAsyncTaskType,
} from "./async-task-type.js";
export { check } from "./checker.js";
export {
	analyzeClosureFactory,
	collectClosureCapturedFields,
	collectClosureCapturedFieldTypes,
	collectClosureFactories,
} from "./closure-analysis.js";
export { collectFunctionDeclarations } from "./declaration-accessors.js";
export { resolveAssignmentTruncation } from "./expression-assignment.js";
export { collectObjectLiteralTypes } from "./expression-objects.js";
export {
	resolveExpressionType,
	resolveMemberCallType,
	resolveMethodCallReturnType,
	resolveReceiverType,
} from "./expressions.js";
export {
	collectImportAliases,
	getImportEffectiveName,
	makeResolveImportedName,
} from "./imports.js";
export {
	buildLibraryFunctionReturnTypes,
	flattenLibraryObjectTypes,
} from "./library-types.js";
export {
	flattenLogicalChain,
	resolveLogicalResultType,
} from "./logical.js";
export {
	collectNullNarrowing,
	createNarrowedTypeResolver,
	isNarrowedAt,
	resolveNarrowedTypeAt,
} from "./narrowing.js";
export {
	decodeObjectShape,
	isObjectShapeType,
} from "./object-shapes.js";
export {
	normalizeOperandTypes,
	resolveBinaryOperationType,
} from "./operators.js";
export {
	collectBoundNames,
	collectReferencedNames,
} from "./references-checks.js";
export { inferFunctionReturnType } from "./return-inference.js";
export {
	collectUserFunctionReturnTypes,
	resolveProjectTypes,
} from "./return-projects.js";
export { resolveStringMethod, STRING_METHODS } from "./string-methods.js";
export {
	inferLiteralType,
	resolveConstIntegerType,
	resolveFloatType,
	resolveIntegerType,
	resolveLiteralDataType,
	resolveNegationType,
	resolveWordDataType,
} from "./type-resolution.js";
export {
	CHARACTER_TYPES,
	COMPARISON_OPERATORS,
	getNonNullableType,
	isNullableType,
	isNullLiteralNode,
	isNumericType,
	LOGICAL_OPERATORS,
	rangeFitsWithin,
	TYPE_RANGES,
} from "./types.js";
export {
	collectVariableTypes,
	resolveVariableType,
} from "./variables.js";
export { walk } from "./walk.js";
export {
	collectArgumentCastWarnings,
	collectAssignmentCastWarnings,
	collectObjectCastWarnings,
} from "./warnings.js";
