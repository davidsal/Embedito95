import {
	getNonNullableType,
	isNullableType,
	isNumericType,
	NULL_TYPE,
} from "./checker/types.js";
import { DATA_TYPE, UNRESOLVED_TYPE } from "./constants.js";

// The string runtime only exposes constructors for these primitives (and their
// nullable variants). Everything else — objects, anonymous shapes, arrays,
// functions, void — has no `String(...)` overload and would fail in C++.
const isConvertiblePrimitive = (type) => {
	return (
		type === DATA_TYPE.string ||
		type === DATA_TYPE.char ||
		type === DATA_TYPE.boolean ||
		isNumericType(type)
	);
};

const isNeverEnumType = () => {
	return false;
};

// Shared allow-list used by both the checker (source of truth) and the codegen
// guard (defense in depth). It accepts an `isEnumType` predicate so each caller
// can resolve enums with the information it already has: the checker owns
// `enumTypes`/`libEnumTypeNames`, while the renderer derives them from the AST
// and the import context.
export const isConvertibleTemplateType = (
	type,
	isEnumType = isNeverEnumType,
) => {
	if (type === UNRESOLVED_TYPE || type === NULL_TYPE) {
		return true;
	}
	if (!type) {
		return false;
	}
	if (isNullableType(type)) {
		return isConvertibleTemplateType(getNonNullableType(type), isEnumType);
	}
	return isConvertiblePrimitive(type) || isEnumType(type);
};

const UNCONVERTIBLE_TEMPLATE_MESSAGE =
	'Cannot render a template interpolation of type "{type}": there is no ' +
	"core_string::String overload for it. The checker must reject it before " +
	"code generation.";

// Thrown by the codegen guard when an unconvertible expression reaches the
// renderer. A build normally stops in the checker first, so this is a controlled
// failure for pipelines that skip or bypass it (LSP previews, `--no-check`
// experiments, or tests that call the strategy directly). It is not an e95
// diagnostic: the checker owns the user-facing error.
export class UnconvertibleTemplateExpressionError extends Error {
	constructor(type) {
		const describedType = type ?? "unknown";
		super(UNCONVERTIBLE_TEMPLATE_MESSAGE.replaceAll("{type}", describedType));
		this.name = "UnconvertibleTemplateExpressionError";
		this.type = describedType;
	}
}
