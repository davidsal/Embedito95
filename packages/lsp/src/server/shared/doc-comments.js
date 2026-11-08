export const getEnumMemberDoc = (comments, memberName) => {
	if (!comments) {
		return null;
	}

	for (let index = comments.length - 1; index >= 0; index--) {
		const comment = comments[index];

		if (!comment.value.startsWith("/**")) {
			continue;
		}

		const lines = comment.value.split("\n");

		for (const line of lines) {
			const match = line.match(/^\s*\*\s*@member\s+(\S+)\s*(.*)/);

			if (match && match[1] === memberName) {
				return match[2].trim() || null;
			}
		}
	}

	return null;
};

export const getDocComment = (comments, statementLine) => {
	if (!comments || comments.length === 0) {
		return null;
	}

	for (let index = comments.length - 1; index >= 0; index--) {
		const comment = comments[index];
		const endLine = comment.line + (comment.value.match(/\n/g) ?? []).length;

		if (endLine === statementLine - 1 && comment.value.startsWith("/**")) {
			let text = comment.value;

			text = text.replace(/^\/\*\*[ \t]*/m, "").replace(/[ \t]*\*\/$/m, "");
			text = text.replace(/^[ \t]*\*[ \t]?/gm, "").trim();

			return text;
		}
	}

	return null;
};

export const extractParamDoc = (docText, paramName) => {
	if (!docText) {
		return null;
	}

	for (const line of docText.split("\n")) {
		const match = line.match(/@param\s+(\S+)\s*(.*)/);

		if (match && match[1] === paramName) {
			return match[2].trim() || null;
		}
	}

	return null;
};

export const formatDocComment = (text) => {
	if (!text) {
		return "";
	}

	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	return `\n\n${lines.join("  \n")}`;
};
