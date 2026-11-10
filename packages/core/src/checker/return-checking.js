import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import {
	isAsyncTaskStateLiteral,
	isAsyncTaskType,
	parseAsyncTaskType,
} from "./async-task-type.js";
import { validateObjectAssignment } from "./object-validation.js";
import { findInvalidReturns } from "./return-assignability.js";
import { inferFunctionReturnType } from "./return-inference.js";
import { NULL_TYPE } from "./types.js";

const filterTaskStateReturns = (inferred) => {
	return {
		...inferred,
		returns: (inferred.returns ?? []).filter((entry) => {
			return !isAsyncTaskStateLiteral(entry.argument);
		}),
	};
};

const resolvePayloadAnnotation = (returnAnnotation) => {
	const parsed = parseAsyncTaskType(returnAnnotation);
	if (!parsed) {
		return returnAnnotation;
	}
	return parsed.argumentType ?? NULL_TYPE;
};

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

	const isAsyncTaskAnnotation = isAsyncTaskType(returnAnnotation);
	const payloadAnnotation = resolvePayloadAnnotation(returnAnnotation);
	const allowTaskStateLiterals =
		functionExpression.async === true && isAsyncTaskAnnotation;
	const returnsToValidate = allowTaskStateLiterals
		? filterTaskStateReturns(inferred)
		: inferred;

	const invalidReturns = inferred.type
		? findInvalidReturns(payloadAnnotation, returnsToValidate, objectTypes)
		: [];

	for (const invalid of invalidReturns) {
		if (
			invalid.argument?.type === AST_NODE.objectLiteral &&
			objectTypes?.[payloadAnnotation]
		) {
			continue;
		}
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.returnTypeMismatch,
				params: {
					name: functionName,
					actual: invalid.type,
					declared: payloadAnnotation,
				},
				location: invalid.loc ?? fallbackLocation,
			}),
		);
	}

	for (const returnEntry of returnsToValidate.returns ?? []) {
		const argument = returnEntry.argument;

		if (
			argument?.type !== AST_NODE.objectLiteral ||
			!objectTypes?.[payloadAnnotation]
		) {
			continue;
		}

		const fieldErrors = validateObjectAssignment(
			argument,
			payloadAnnotation,
			objectTypes,
			resolveNameType,
			wordSize,
		);

		if (fieldErrors.length > 0) {
			errors.push(...fieldErrors);
		}
	}
};
