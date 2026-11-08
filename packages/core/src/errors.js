import { ERROR_CODE, SEVERITY } from "./constants.js";

export const makeDiagnostic = (input) => {
	return {
		code: input.code,
		params: input.params ?? {},
		location: input.location,
		severity: input.severity ?? SEVERITY.error,
		...(input.tag !== undefined && { tag: input.tag }),
	};
};

export const isTruncationWarning = (diagnostic) => {
	return (
		(diagnostic.code === ERROR_CODE.assignmentTypeMismatch ||
			diagnostic.code === ERROR_CODE.argumentTypeMismatch) &&
		(diagnostic.severity ?? SEVERITY.error) === SEVERITY.warning
	);
};
