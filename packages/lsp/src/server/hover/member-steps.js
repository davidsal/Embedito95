import { collectLocalObjectTypes } from "../shared/type-inference.js";
import { getObjectMemberDocSection } from "./doc-sections.js";
import { NOT_HANDLED } from "./local-steps.js";
import {
	resolveObjectMemberFromType,
	resolveObjectMemberHover,
} from "./object-members.js";

export const resolveObjectPropertyHover = (context) => {
	if (context.identifier || !context.objectPropertyAt) {
		return NOT_HANDLED;
	}

	const localObjectTypes = collectLocalObjectTypes(context.syntaxTree);
	const memberSignature = resolveObjectMemberHover(
		context.syntaxTree,
		context.objectPropertyAt,
		[],
		localObjectTypes,
		context.resolveNameType,
		context.resolveCallType,
	);

	if (memberSignature) {
		return {
			contents: {
				kind: "markdown",
				value: `\`\`\`e95\n${memberSignature}\n\`\`\``,
			},
		};
	}

	return null;
};

export const resolveMemberObjectHover = (context) => {
	if (!context.memberObjectType) {
		return NOT_HANDLED;
	}

	const objectTypeName = context.memberObjectType;
	const memberSignature = resolveObjectMemberFromType(
		{ key: context.name },
		objectTypeName,
		context.objectTypes,
	);

	if (!memberSignature) {
		return NOT_HANDLED;
	}

	const docSection = getObjectMemberDocSection(
		context.syntaxTree,
		context.comments,
		objectTypeName,
		context.name,
		context.documentUri,
		context.allExports,
	);

	return {
		contents: {
			kind: "markdown",
			value: `\`\`\`e95\n${memberSignature}\n\`\`\`${docSection}`,
		},
	};
};
