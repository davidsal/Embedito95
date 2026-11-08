import { escapeRegex } from "../shared/libraries.js";

export const buildAutoImportEdits = (source, libraryName, exportName) => {
	const lines = source.split("\n");
	const importRegex = new RegExp(
		`^\\s*import\\s*\\{[^}]*\\}\\s*from\\s*['"]${escapeRegex(libraryName)}['"]\\s*$`,
	);

	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].match(importRegex);

		if (match) {
			const beforeBrace = lines[index].indexOf("{");
			const afterBrace = lines[index].indexOf("}");
			const existing = lines[index]
				.slice(beforeBrace + 1, afterBrace)
				.split(",")
				.map((specifier) => specifier.trim())
				.filter(Boolean);

			const hasImport = existing.some((specifier) => {
				return specifier.split(/\s+as\s+/)[0].trim() === exportName;
			});

			if (hasImport) {
				return [];
			}

			const newSpecifiers = [...existing, exportName].join(", ");
			const newLine =
				lines[index].slice(0, beforeBrace + 1) +
				` ${newSpecifiers} ` +
				lines[index].slice(afterBrace);

			return [
				{
					range: {
						start: { line: index, character: 0 },
						end: { line: index, character: lines[index].length },
					},
					newText: newLine,
				},
			];
		}
	}

	let lastImportIndex = -1;

	for (let index = 0; index < lines.length; index++) {
		if (lines[index].trim().startsWith("import")) {
			lastImportIndex = index;
		}
	}

	const newImport = `import { ${exportName} } from '${libraryName}'`;

	if (lastImportIndex >= 0) {
		return [
			{
				range: {
					start: { line: lastImportIndex + 1, character: 0 },
					end: { line: lastImportIndex + 1, character: 0 },
				},
				newText: `${newImport}\n`,
			},
		];
	}

	const insertLine = lines.findIndex(
		(line) => line.trim() && !line.trim().startsWith("//"),
	);
	const targetLine = insertLine >= 0 ? insertLine : lines.length;

	return [
		{
			range: {
				start: { line: targetLine, character: 0 },
				end: { line: targetLine, character: 0 },
			},
			newText: `${newImport}\n${targetLine === 0 ? "" : "\n"}`,
		},
	];
};
