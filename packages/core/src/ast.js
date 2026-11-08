import { TOKEN_TYPE } from "./constants.js";

export const PUNCTUATION = [
	{ char: "{", type: TOKEN_TYPE.leftBrace, label: '"{"' },
	{ char: "}", type: TOKEN_TYPE.rightBrace, label: '"}"' },
	{ char: "[", type: TOKEN_TYPE.leftBracket, label: '"["' },
	{ char: "]", type: TOKEN_TYPE.rightBracket, label: '"]"' },
	{ char: "(", type: TOKEN_TYPE.leftParenthesis, label: '"("' },
	{ char: ")", type: TOKEN_TYPE.rightParenthesis, label: '")"' },
	{ char: ",", type: TOKEN_TYPE.comma, label: '","' },
	{ char: ":", type: TOKEN_TYPE.colon, label: '":"' },
	{ char: "?", type: TOKEN_TYPE.question, label: '"?"' },
	{ char: ";", type: TOKEN_TYPE.semicolon, label: '";"' },
	{ char: "=", type: TOKEN_TYPE.equal, label: '"="' },
	{ char: "=>", type: TOKEN_TYPE.arrow, label: '"=>"' },
	{ char: "|", type: TOKEN_TYPE.pipe, label: '"|"' },
	{ char: ".", type: TOKEN_TYPE.dot, label: '"."' },
];
