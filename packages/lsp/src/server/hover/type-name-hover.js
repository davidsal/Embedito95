import { formatDocComment } from "../shared/doc-comments.js";
import { getLibraryDocComment } from "../shared/library-docs.js";
import {
	formatMethodParameterList,
	OPTIONAL_TYPE_SUFFIX,
} from "./formatting.js";
import { NOT_HANDLED } from "./local-steps.js";

// Hover when the cursor sits on a TYPE reference (a name inside a type
// annotation, a return type, or a type member). Library object types are NOT
// exported as value entries (function/constant), so without this step the name
// falls through to the value/variable resolution and is misreported as a
// `const <name>: unknown`. Local types and library enums are already handled
// earlier (resolveStatementDeclarationHover / resolveLibraryExportHover).
export const resolveObjectTypeNameHover = (context) => {
	if (!context.isTypeReference) {
		return NOT_HANDLED;
	}

	const { name, allExports } = context;
	const definition = allExports.objectTypeDefinitions?.[name];

	if (!definition) {
		return NOT_HANDLED;
	}

	const memberLines = [];
	for (const [fieldName, field] of Object.entries(definition.fields ?? {})) {
		memberLines.push(
			`    ${fieldName}: ${field.type}${field.optional ? OPTIONAL_TYPE_SUFFIX : ""}`,
		);
	}
	for (const [methodName, method] of Object.entries(definition.methods ?? {})) {
		const parameters = formatMethodParameterList(method.params);
		memberLines.push(
			`    ${methodName}: (${parameters}) => ${method.returnType ?? "void"}`,
		);
	}

	const body =
		memberLines.length > 0 ? `{\n${memberLines.join(",\n")}\n}` : "{}";
	const signature = `\`\`\`e95\ntype ${name} = ${body}\n\`\`\``;

	let docSection = "";
	const libraryName = allExports.objectTypeLibraries?.[name];

	if (libraryName) {
		const docComment = getLibraryDocComment(
			context.documentUri,
			libraryName,
			name,
		);
		docSection = formatDocComment(docComment);
	}

	return {
		contents: {
			kind: "markdown",
			value: signature + docSection,
		},
	};
};
