import { InsertTextFormat } from "vscode-languageserver";

export const KEYWORD_COMPLETIONS = [
	{
		label: "import",
		kind: 14,
		detail: "keyword",
		insertText: "import {  } from ''",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "const",
		kind: 14,
		detail: "keyword",
		insertText: "const $0",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "let",
		kind: 14,
		detail: "keyword",
		insertText: "let $0",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "for",
		kind: 14,
		detail: "keyword",
		insertText: "for ($1; $2; $3) {\n\t$0\n}",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "while",
		kind: 14,
		detail: "keyword",
		insertText: "while ($1) {\n\t$0\n}",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "do",
		kind: 14,
		detail: "keyword",
		insertText: "do {\n\t$0\n} while ($1)",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "if",
		kind: 14,
		detail: "keyword",
		insertText: "if ($1) {\n\t$0\n}",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "else",
		kind: 14,
		detail: "keyword",
		insertText: "else {\n\t$0\n}",
		insertTextFormat: InsertTextFormat.Snippet,
	},
	{
		label: "from",
		kind: 14,
		detail: "keyword",
	},
	{
		label: "true",
		kind: 21,
		detail: "constant",
	},
	{
		label: "false",
		kind: 21,
		detail: "constant",
	},
];
