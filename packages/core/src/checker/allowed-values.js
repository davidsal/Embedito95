import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";

const ALLOWED_VALUE_SEPARATOR = ", ";

const describeMemberArgument = (argument) => {
	return `${argument.object.name}.${argument.property.name}`;
};

// Library parameters may declare a finite set of accepted enum members (for
// example, the pins that expose an interrupt channel). Only enum member
// arguments are narrowed here: a variable or a computed value keeps its normal
// type check, so a value the checker cannot see never becomes a false positive.
export const checkAllowedArgumentValue = (errors, argument, param) => {
	const allowedValues = param?.allowedValues;
	if (!allowedValues || allowedValues.length === 0) {
		return;
	}
	if (argument.type !== AST_NODE.memberExpression) {
		return;
	}
	if (argument.object?.type !== AST_NODE.identifier) {
		return;
	}
	const memberName = argument.property?.name;
	if (memberName === undefined || memberName === null) {
		return;
	}
	const value = String(memberName);
	if (allowedValues.includes(value)) {
		return;
	}
	errors.push(
		makeDiagnostic({
			code: ERROR_CODE.argumentValueNotAllowed,
			params: {
				name: param.name,
				value: describeMemberArgument(argument),
				allowed: allowedValues.join(ALLOWED_VALUE_SEPARATOR),
			},
			location: argument.loc,
		}),
	);
};
