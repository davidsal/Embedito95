import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { validateObjectAssignment } from "./object-validation.js";
import { findInvalidReturns } from "./return-assignability.js";
import { inferFunctionReturnType } from "./return-inference.js";

export const checkFunctionReturnTypes = (
	functionExpression,
	functionName,
	returnAnnotation,
	fallbackLocation,
	resolveNameType,
	resolveCallType,
	wordSize,
	ast,
	objectTypes,
	errors,
) => {
	if (!functionExpression) {
		return;
	}

	const inferred = inferFunctionReturnType(
		functionExpression,
		resolveNameType,
		resolveCallType,
		wordSize,
		ast,
		objectTypes,
	);

	if (inferred.conflict) {
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.incompatibleReturnTypes,
				params: { name: functionName },
				location: fallbackLocation,
			}),
		);
		return;
	}

	if (!returnAnnotation) {
		return;
	}

	const invalidReturns = inferred.type
		? findInvalidReturns(returnAnnotation, inferred, objectTypes)
		: [];

	for (const invalid of invalidReturns) {
		if (
			invalid.argument?.type === AST_NODE.objectLiteral &&
			objectTypes?.[returnAnnotation]
		) {
			continue;
		}
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.returnTypeMismatch,
				params: {
					name: functionName,
					actual: inferred.type,
					declared: returnAnnotation,
				},
				location: invalid.loc ?? fallbackLocation,
			}),
		);
	}

	for (const returnEntry of inferred.returns ?? []) {
		const argument = returnEntry.argument;

		if (
			argument?.type !== AST_NODE.objectLiteral ||
			!objectTypes?.[returnAnnotation]
		) {
			continue;
		}

		const fieldErrors = validateObjectAssignment(
			argument,
			returnAnnotation,
			objectTypes,
			resolveNameType,
			wordSize,
		);

		if (fieldErrors.length > 0) {
			errors.push(...fieldErrors);
		}
	}
};
