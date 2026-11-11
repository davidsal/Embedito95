import { ERROR_CODE } from "./constants.js";

const DIAG_MESSAGES = {
	[ERROR_CODE.unexpectedToken]: "Expected {expected} but found {found}",
	[ERROR_CODE.unexpectedEof]: "Unexpected end of file",
	[ERROR_CODE.unsupportedType]: "Type {type} is not supported by this platform",
	[ERROR_CODE.reservedName]: "{name} is a reserved function name",
	[ERROR_CODE.unexpectedExpression]: "Unexpected expression '{name}'",
	[ERROR_CODE.expectedStatement]:
		"Expected a function call or assignment, but found '{name}'",
	[ERROR_CODE.missingRequiredFunction]:
		"Missing required function '{name}'. Add: const {name} = () => {}",
	[ERROR_CODE.unusedFunction]: "Unused function '{name}'",
	[ERROR_CODE.unusedConstant]: "Unused constant '{name}'",
	[ERROR_CODE.unusedType]: "Unused type '{name}'",
	[ERROR_CODE.unusedEnum]: "Unused enum '{name}'",
	[ERROR_CODE.missingSetupCall]:
		"First statement in 'main' should be a call to 'setup()'",
	[ERROR_CODE.usedBeforeDeclaration]: "'{name}' is used before its declaration",
	[ERROR_CODE.emptyImport]: "Import specifiers cannot be empty",
	[ERROR_CODE.emptyImportSource]: "Import source cannot be empty",
	[ERROR_CODE.unknownLibrary]: "Unknown library '{name}'",
	[ERROR_CODE.unknownImport]: "'{name}' is not exported by the library",
	[ERROR_CODE.libraryLoadFailed]: "Failed to load library '{name}'",
	[ERROR_CODE.duplicateImport]: "Duplicate import '{name}'",
	[ERROR_CODE.wrongArgumentCount]:
		"'{name}' expects {expected} argument(s) but got {got}",
	[ERROR_CODE.argumentValueNotAllowed]:
		"Argument '{name}' does not accept {value}; allowed values: {allowed}.",
	[ERROR_CODE.argumentTypeMismatch]:
		"Argument '{name}' expects type '{expected}' but {formattedValue} is '{actual}'",
	[ERROR_CODE.undefinedReference]: "'{name}' is not defined",
	[ERROR_CODE.unusedImport]: "Unused import '{name}'",
	[ERROR_CODE.preferConst]:
		"'{name}' is declared with 'let' but is never reassigned. Prefer 'const'.",
	[ERROR_CODE.expectedFunction]: "'{name}' must be a function",
	[ERROR_CODE.asyncRequiredFunction]: "'{name}' cannot be async",
	[ERROR_CODE.awaitOutsideAsync]:
		"'await' can only be used inside an 'async' function",
	[ERROR_CODE.asyncBuiltinOutsideAsync]:
		"'{name}' can only be called inside an 'async' function",
	[ERROR_CODE.missingAwait]:
		"'{name}' is async and must be awaited with 'await'",
	[ERROR_CODE.invalidAwaitTarget]:
		"'await' can only be used with an 'AsyncTask' value, got '{type}'",
	[ERROR_CODE.typeArgumentsNotAllowed]:
		"Type parameters are not supported on '{type}': only 'AsyncTask' accepts type arguments",
	[ERROR_CODE.invalidCharacter]: "Invalid character '{character}'",
	[ERROR_CODE.invalidCharLiteral]:
		"Char literal (single quotes) must contain exactly one character, got {count}",
	[ERROR_CODE.missingInitializer]: "Expected '=' after '{name}'",
	[ERROR_CODE.duplicateDeclaration]:
		"Cannot redeclare block-scoped variable '{name}'",
	[ERROR_CODE.undefinedMethod]: "'{name}' is not a method of type '{typeName}'",
	[ERROR_CODE.invalidMemberAccess]:
		"Cannot access member '{name}' on type '{type}': '{type}' has no members.",
	[ERROR_CODE.invalidReceiverCast]:
		"Cannot call a method on a cast from '{source}' to '{target}': the cast target must be a handle type that matches the source.",
	[ERROR_CODE.exportNotAllowed]: "'export' is only allowed in library files",
	[ERROR_CODE.missingTypeAnnotation]:
		"Parameter '{name}' must have a type annotation (name: type)",
	[ERROR_CODE.unknownType]: "Unknown type '{type}'",
	[ERROR_CODE.arbitraryUnion]:
		"Union type '{type}' is not supported: only 'T | null' is allowed.",

	[ERROR_CODE.functionNotAllowed]:
		"Function declarations are not allowed. Use arrow functions instead.",
	[ERROR_CODE.duplicateEnumValue]:
		"Duplicate enum value '{value}' (used by '{prev}' and '{name}')",
	[ERROR_CODE.mixedEnumTypes]:
		"Enum members must have the same type, got: {types}",
	[ERROR_CODE.mixedArrayTypes]:
		"Array elements must have the same type. Use an explicit element type annotation (e.g. arr: f32[]).",
	[ERROR_CODE.emptyEnum]:
		"Enum '{name}' cannot be empty. Add at least one member.",
	[ERROR_CODE.valueOutOfRange]:
		"Value {value} overflows type '{type}' ({min}..{max}) in '{name}'",
	[ERROR_CODE.comparisonAlwaysTrue]:
		"'{name} {operator} {literal}' is always true because '{name}' is {type} ({min}..{max})",
	[ERROR_CODE.comparisonAlwaysFalse]:
		"'{name} {operator} {literal}' is always false because '{name}' is {type} ({min}..{max})",
	[ERROR_CODE.explicitFloatInIntContext]:
		"Cannot store a float in an integer target (it has no decimals).",
	[ERROR_CODE.divisionByZero]:
		"Division by zero in '{operator}': the divisor evaluates to 0",
	[ERROR_CODE.assignmentTypeMismatch]:
		"Cannot assign '{rhsType}' value to '{name}' of type '{type}'.",
	[ERROR_CODE.comparisonTypeMismatch]:
		"Cannot compare '{leftType}' with '{rightType}' using '{operator}': incompatible types.",
	[ERROR_CODE.enumOrderingComparison]:
		"Enums don't support '{operator}': only '==' and '!=' comparisons are allowed.",
	[ERROR_CODE.nestedTernary]:
		"Nested ternary expressions are not allowed. Extract the inner expression to a function instead.",
	[ERROR_CODE.ternaryBranchTypeMismatch]:
		"Ternary branches have incompatible types: '{leftType}' vs '{rightType}'.",
	[ERROR_CODE.ternaryConditionTypeMismatch]:
		"Ternary condition must be boolean, got '{type}'.",
	[ERROR_CODE.nonNumericOperand]:
		"Cannot use '{type}' with '{operator}': arithmetic operands must be numeric.",
	[ERROR_CODE.logicalTypeMismatch]:
		"Cannot use '{operator}' with '{leftType}' and '{rightType}': incompatible types.",
	[ERROR_CODE.mixedLogicalOperators]:
		"Cannot mix '??' with '&&' or '||' without parentheses.",
	[ERROR_CODE.nullableOperation]:
		"'{name}' is '{type}' and could be null. Check it with '!= null' first.",
	[ERROR_CODE.floatModulo]: "Cannot use '{operator}' with float operands.",
	[ERROR_CODE.updateExpressionNotAllowed]:
		"The '{operator}' update operator is not allowed. Use '{operator0}= 1' instead.",
	[ERROR_CODE.operatorAtLineEnd]:
		"The '{operator}' operator cannot end a line. Put the right operand on the same line.",
	[ERROR_CODE.strictEquality]:
		"The '{operator}' operator is not part of e95: strict equality checks are not supported. Use '{suggested}' instead.",
	[ERROR_CODE.constReassignment]:
		"Cannot reassign '{name}': it is declared with 'const'.",
	[ERROR_CODE.methodAssignment]:
		"Cannot assign to '{name}': it is a method, and methods are not values that can be reassigned.",
	[ERROR_CODE.incompatibleReturnTypes]:
		"Function '{name}' has incompatible return types.",
	[ERROR_CODE.returnTypeMismatch]:
		"Function '{name}' returns '{actual}', but its declared return type is '{declared}'.",
	[ERROR_CODE.functionTypeAnnotation]:
		"Declare the return type on the parameters: '(): {type} =>'.",
	[ERROR_CODE.missingReturnStatement]:
		"Function with return type '{type}' is missing a return statement.",
	[ERROR_CODE.missingObjectField]:
		"Object literal for type '{type}' is missing required field '{field}'.",
	[ERROR_CODE.unknownObjectField]:
		"Object literal has field '{field}' that does not exist in type '{type}'.",
	[ERROR_CODE.objectFieldTypeMismatch]:
		"Cannot assign '{actual}' to field '{field}' of type '{expected}'.",
	[ERROR_CODE.objectTypeMismatch]:
		"Object literal does not match type '{type}': '{detail}'.",
	[ERROR_CODE.objectSelfReference]:
		"Storing '{name}' inside its own field '{field}' would create a reference cycle; object self-references are not allowed (no garbage collector).",
	[ERROR_CODE.methodOnlyObjectLiteral]:
		"Type '{type}' has methods but no data fields, so an inline method for '{method}' must be a plain function that does not capture local state. Reference a named function, drop the captured state, or build the object with a factory.",
	[ERROR_CODE.capturedFieldAccess]:
		"Field '{field}' of type '{type}' is captured by the closure, so it is private and cannot be accessed from outside.",
	[ERROR_CODE.callbackCapturesLocalState]:
		"Callback handler for '{name}' captures local state; register a top-level function instead.",
	[ERROR_CODE.callbackSignatureMismatch]:
		"Callback handler '{name}' does not match the expected signature '{expected}' (found '{actual}'): {detail}.",
	[ERROR_CODE.unreachableCode]:
		"Unreachable code: this statement comes after a 'return'.",
	[ERROR_CODE.nonExhaustiveSwitch]:
		"Switch on enum '{type}' is not exhaustive: missing {members}. Cover all cases or add a 'default'.",
	[ERROR_CODE.unsupportedLocalClosure]:
		"Local closure '{name}' is not supported here. Declare it at module level or return it directly as a property of a closure factory.",
	[ERROR_CODE.unsupportedNestedClosureProperty]:
		"Closure '{name}' is nested inside property '{property}'; a closure returned by a factory must be a direct property of the returned object.",
	[ERROR_CODE.unsupportedClosureFactoryStatement]:
		"Statements other than declarations and the returned object are not supported in a closure factory body. Move this statement into a method.",
	[ERROR_CODE.unsupportedClosureFactoryLocal]:
		"Local '{name}' of a closure factory is neither a local closure nor captured by a method, so its initializer would be dropped. Move it into a method or capture it.",
};

export const formatDiagnosticMessage = (diagnostic) => {
	const template = DIAG_MESSAGES[diagnostic.code];

	if (!template) {
		return diagnostic.code;
	}

	let message = template;

	for (const [key, value] of Object.entries(diagnostic.params ?? {})) {
		const formattedValue =
			typeof value === "number" ? `literal ${value}` : `'${value}'`;

		if (key === "value") {
			message = message.replace("{value}", `'${value}'`);
			message = message.replace("{formattedValue}", formattedValue);
		} else {
			message = message.replaceAll(`{${key}}`, value);
		}
	}

	return message;
};
