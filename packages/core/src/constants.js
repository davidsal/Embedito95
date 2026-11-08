export const DATA_TYPE = {
	u8: "u8",
	i8: "i8",
	u16: "u16",
	i16: "i16",
	u32: "u32",
	i32: "i32",
	u64: "u64",
	i64: "i64",
	i128: "i128",
	u128: "u128",
	f32: "f32",
	f64: "f64",
	string: "string",
	char: "char",
	boolean: "boolean",
	void: "void",
};

export const DATA_TYPES = new Set(Object.values(DATA_TYPE));

export const OBJECT_TYPE = "Object";

export const FLOAT_TYPES = new Set([DATA_TYPE.f32, DATA_TYPE.f64]);

export const DEFAULT_WORD_SIZE = 16;

export const CONST_KIND = "const";
export const ADD_OPERATOR = "+";
export const SUBTRACT_OPERATOR = "-";
export const MULTIPLY_OPERATOR = "*";
export const DIVIDE_OPERATOR = "/";
export const MODULO_OPERATOR = "%";
export const NOT_OPERATOR = "!";
export const UNARY_PLUS_OPERATOR = "+";

export const SEVERITY = {
	error: 0,
	warning: 1,
	info: 2,
};

const ERROR_PREFIX = "error.";

export const ERROR_CODE = {
	unexpectedToken: `${ERROR_PREFIX}unexpectedToken`,
	unexpectedEof: `${ERROR_PREFIX}unexpectedEof`,
	unsupportedType: `${ERROR_PREFIX}unsupportedType`,
	reservedName: `${ERROR_PREFIX}reservedName`,
	unexpectedExpression: `${ERROR_PREFIX}unexpectedExpression`,
	expectedStatement: `${ERROR_PREFIX}expectedStatement`,
	invalidNumber: `${ERROR_PREFIX}invalidNumber`,
	undefinedReference: `${ERROR_PREFIX}undefinedReference`,
	missingRequiredFunction: `${ERROR_PREFIX}missingRequiredFunction`,
	unusedFunction: `${ERROR_PREFIX}unusedFunction`,
	missingSetupCall: `${ERROR_PREFIX}missingSetupCall`,
	usedBeforeDeclaration: `${ERROR_PREFIX}usedBeforeDeclaration`,
	emptyImport: `${ERROR_PREFIX}emptyImport`,
	emptyImportSource: `${ERROR_PREFIX}emptyImportSource`,
	unknownLibrary: `${ERROR_PREFIX}unknownLibrary`,
	unknownImport: `${ERROR_PREFIX}unknownImport`,
	duplicateImport: `${ERROR_PREFIX}duplicateImport`,
	wrongArgumentCount: `${ERROR_PREFIX}wrongArgumentCount`,
	unusedImport: `${ERROR_PREFIX}unusedImport`,
	preferConst: `${ERROR_PREFIX}preferConst`,
	expectedFunction: `${ERROR_PREFIX}expectedFunction`,
	asyncRequiredFunction: `${ERROR_PREFIX}asyncRequiredFunction`,
	awaitOutsideAsync: `${ERROR_PREFIX}awaitOutsideAsync`,
	asyncBuiltinOutsideAsync: `${ERROR_PREFIX}asyncBuiltinOutsideAsync`,
	missingAwait: `${ERROR_PREFIX}missingAwait`,
	invalidCharacter: `${ERROR_PREFIX}invalidCharacter`,
	invalidCharLiteral: `${ERROR_PREFIX}invalidCharLiteral`,
	missingInitializer: `${ERROR_PREFIX}missingInitializer`,
	duplicateDeclaration: `${ERROR_PREFIX}duplicateDeclaration`,
	undefinedMethod: `${ERROR_PREFIX}undefinedMethod`,
	invalidReceiverCast: `${ERROR_PREFIX}invalidReceiverCast`,
	exportNotAllowed: `${ERROR_PREFIX}exportNotAllowed`,
	missingTypeAnnotation: `${ERROR_PREFIX}missingTypeAnnotation`,
	unknownType: `${ERROR_PREFIX}unknownType`,
	arbitraryUnion: `${ERROR_PREFIX}arbitraryUnion`,
	functionNotAllowed: `${ERROR_PREFIX}functionNotAllowed`,
	duplicateEnumValue: `${ERROR_PREFIX}duplicateEnumValue`,
	mixedEnumTypes: `${ERROR_PREFIX}mixedEnumTypes`,
	mixedArrayTypes: `${ERROR_PREFIX}mixedArrayTypes`,
	emptyEnum: `${ERROR_PREFIX}emptyEnum`,
	argumentTypeMismatch: `${ERROR_PREFIX}argumentTypeMismatch`,
	argumentValueNotAllowed: `${ERROR_PREFIX}argumentValueNotAllowed`,
	unusedConstant: `${ERROR_PREFIX}unusedConstant`,
	unusedType: `${ERROR_PREFIX}unusedType`,
	unusedEnum: `${ERROR_PREFIX}unusedEnum`,
	missingReturnStatement: `${ERROR_PREFIX}missingReturnStatement`,
	libraryLoadFailed: `${ERROR_PREFIX}libraryLoadFailed`,
	valueOutOfRange: `${ERROR_PREFIX}valueOutOfRange`,
	comparisonAlwaysTrue: `${ERROR_PREFIX}comparisonAlwaysTrue`,
	comparisonAlwaysFalse: `${ERROR_PREFIX}comparisonAlwaysFalse`,
	explicitFloatInIntContext: `${ERROR_PREFIX}explicitFloatInIntContext`,
	updateExpressionNotAllowed: `${ERROR_PREFIX}updateExpressionNotAllowed`,
	operatorAtLineEnd: `${ERROR_PREFIX}operatorAtLineEnd`,
	strictEquality: `${ERROR_PREFIX}strictEquality`,
	divisionByZero: `${ERROR_PREFIX}divisionByZero`,
	assignmentTypeMismatch: `${ERROR_PREFIX}assignmentTypeMismatch`,
	comparisonTypeMismatch: `${ERROR_PREFIX}comparisonTypeMismatch`,
	enumOrderingComparison: `${ERROR_PREFIX}enumOrderingComparison`,
	nestedTernary: `${ERROR_PREFIX}nestedTernary`,
	ternaryBranchTypeMismatch: `${ERROR_PREFIX}ternaryBranchTypeMismatch`,
	ternaryConditionTypeMismatch: `${ERROR_PREFIX}ternaryConditionTypeMismatch`,
	nonNumericOperand: `${ERROR_PREFIX}nonNumericOperand`,
	logicalTypeMismatch: `${ERROR_PREFIX}logicalTypeMismatch`,
	mixedLogicalOperators: `${ERROR_PREFIX}mixedLogicalOperators`,
	nullableOperation: `${ERROR_PREFIX}nullableOperation`,
	floatModulo: `${ERROR_PREFIX}floatModulo`,
	constReassignment: `${ERROR_PREFIX}constReassignment`,
	methodAssignment: `${ERROR_PREFIX}methodAssignment`,
	incompatibleReturnTypes: `${ERROR_PREFIX}incompatibleReturnTypes`,
	returnTypeMismatch: `${ERROR_PREFIX}returnTypeMismatch`,
	functionTypeAnnotation: `${ERROR_PREFIX}functionTypeAnnotation`,
	missingObjectField: `${ERROR_PREFIX}missingObjectField`,
	unknownObjectField: `${ERROR_PREFIX}unknownObjectField`,
	objectFieldTypeMismatch: `${ERROR_PREFIX}objectFieldTypeMismatch`,
	objectTypeMismatch: `${ERROR_PREFIX}objectTypeMismatch`,
	objectSelfReference: `${ERROR_PREFIX}objectSelfReference`,
	methodOnlyObjectLiteral: `${ERROR_PREFIX}methodOnlyObjectLiteral`,
	capturedFieldAccess: `${ERROR_PREFIX}capturedFieldAccess`,
	callbackCapturesLocalState: `${ERROR_PREFIX}callbackCapturesLocalState`,
	callbackMustBeNamed: `${ERROR_PREFIX}callbackMustBeNamed`,
	callbackHasParameters: `${ERROR_PREFIX}callbackHasParameters`,
	unreachableCode: `${ERROR_PREFIX}unreachableCode`,
	nonExhaustiveSwitch: `${ERROR_PREFIX}nonExhaustiveSwitch`,
	unsupportedLocalClosure: `${ERROR_PREFIX}unsupportedLocalClosure`,
	unsupportedNestedClosureProperty: `${ERROR_PREFIX}unsupportedNestedClosureProperty`,
	unsupportedClosureFactoryStatement: `${ERROR_PREFIX}unsupportedClosureFactoryStatement`,
	unsupportedClosureFactoryLocal: `${ERROR_PREFIX}unsupportedClosureFactoryLocal`,
};

export const TOKEN_TYPE = {
	keyword: "keyword",
	identifier: "identifier",
	string: "string",
	template: "template",
	number: "number",
	leftBrace: "leftBrace",
	rightBrace: "rightBrace",
	leftBracket: "leftBracket",
	rightBracket: "rightBracket",
	leftParenthesis: "leftParenthesis",
	rightParenthesis: "rightParenthesis",
	comma: "comma",
	colon: "colon",
	equal: "equal",
	arrow: "arrow",
	semicolon: "semicolon",
	pipe: "pipe",
	dot: "dot",
	comment: "comment",
	eof: "eof",
	plus: "plus",
	minus: "minus",
	star: "star",
	slash: "slash",
	percent: "percent",
	lessThan: "lessThan",
	greaterThan: "greaterThan",
	lessThanOrEqual: "lessThanOrEqual",
	greaterThanOrEqual: "greaterThanOrEqual",
	equalEqual: "equalEqual",
	notEqual: "notEqual",
	strictEqual: "strictEqual",
	strictNotEqual: "strictNotEqual",
	ampersandAmpersand: "ampersandAmpersand",
	pipePipe: "pipePipe",
	nullishCoalescing: "nullishCoalescing",
	plusPlus: "plusPlus",
	minusMinus: "minusMinus",
	plusEqual: "plusEqual",
	minusEqual: "minusEqual",
	starEqual: "starEqual",
	slashEqual: "slashEqual",
	percentEqual: "percentEqual",
	bang: "bang",
	question: "question",
};

export const QUOTE_SINGLE = "'";
export const QUOTE_DOUBLE = '"';

export const AST_NODE = {
	program: "Program",
	importDeclaration: "ImportDeclaration",
	importSpecifier: "ImportSpecifier",
	variableDeclaration: "VariableDeclaration",
	variableDeclarator: "VariableDeclarator",
	functionExpression: "FunctionExpression",
	blockStatement: "BlockStatement",
	whileStatement: "WhileStatement",
	returnStatement: "ReturnStatement",
	expressionStatement: "ExpressionStatement",
	callExpression: "CallExpression",
	identifier: "Identifier",
	literal: "Literal",
	templateLiteral: "TemplateLiteral",
	arrayLiteral: "ArrayLiteral",
	objectLiteral: "ObjectLiteral",
	objectProperty: "ObjectProperty",
	indexExpression: "IndexExpression",
	enumDeclaration: "EnumDeclaration",
	typeDeclaration: "TypeDeclaration",
	memberExpression: "MemberExpression",
	thisExpression: "ThisExpression",
	forStatement: "ForStatement",
	doWhileStatement: "DoWhileStatement",
	binaryExpression: "BinaryExpression",
	assignmentExpression: "AssignmentExpression",
	updateExpression: "UpdateExpression",
	unaryExpression: "UnaryExpression",
	ifStatement: "IfStatement",
	parenthesizedExpression: "ParenthesizedExpression",
	asExpression: "AsExpression",
	conditionalExpression: "ConditionalExpression",
	awaitExpression: "AwaitExpression",
	switchStatement: "SwitchStatement",
	switchCase: "SwitchCase",
	breakStatement: "BreakStatement",
};

export const UNRESOLVED_TYPE = "Pin";

export const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/", "%"]);

export const INTEGER_WIDTHS = {
	[DATA_TYPE.u8]: 8,
	[DATA_TYPE.i8]: 8,
	[DATA_TYPE.u16]: 16,
	[DATA_TYPE.i16]: 16,
	[DATA_TYPE.u32]: 32,
	[DATA_TYPE.i32]: 32,
	[DATA_TYPE.u64]: 64,
	[DATA_TYPE.i64]: 64,
	[DATA_TYPE.i128]: 128,
	[DATA_TYPE.u128]: 128,
};

// Lexer
export const NEWLINE = "\n";
export const SLASH = "/";
export const STAR = "*";

export const KEYWORDS = new Set([
	"import",
	"const",
	"let",
	"while",
	"do",
	"for",
	"if",
	"else",
	"return",
	"true",
	"false",
	"null",
	"from",
	"async",
	"await",
	"export",
	"function",
	"enum",
	"type",
	"this",
	"switch",
	"case",
	"default",
	"break",
]);

export const OPERATORS = [
	["===", TOKEN_TYPE.strictEqual],
	["!==", TOKEN_TYPE.strictNotEqual],
	["??", TOKEN_TYPE.nullishCoalescing],
	["<=", TOKEN_TYPE.lessThanOrEqual],
	[">=", TOKEN_TYPE.greaterThanOrEqual],
	["==", TOKEN_TYPE.equalEqual],
	["!=", TOKEN_TYPE.notEqual],
	["&&", TOKEN_TYPE.ampersandAmpersand],
	["||", TOKEN_TYPE.pipePipe],
	["++", TOKEN_TYPE.plusPlus],
	["--", TOKEN_TYPE.minusMinus],
	["+=", TOKEN_TYPE.plusEqual],
	["-=", TOKEN_TYPE.minusEqual],
	["*=", TOKEN_TYPE.starEqual],
	["/=", TOKEN_TYPE.slashEqual],
	["%=", TOKEN_TYPE.percentEqual],
];

export const SINGLE_OPERATORS = [
	["+", TOKEN_TYPE.plus],
	["-", TOKEN_TYPE.minus],
	["*", TOKEN_TYPE.star],
	["/", TOKEN_TYPE.slash],
	["%", TOKEN_TYPE.percent],
	["<", TOKEN_TYPE.lessThan],
	[">", TOKEN_TYPE.greaterThan],
	["!", TOKEN_TYPE.bang],
];

// Parser
export const AWAIT_KEYWORD = "await";

// Core async library (`@embedito95/async`) and its timing builtins. Calls to
// these are only valid inside an `async` function and must be awaited.
export const ASYNC_LIBRARY_NAME = "@embedito95/async";
export const ASYNC_BUILTIN_NAMES = new Set(["sleep", "sleepMicros"]);

export const LITERAL_VALUES = new Map([
	["true", true],
	["false", false],
	["null", null],
]);

export const LITERAL_KEYWORDS = new Set(LITERAL_VALUES.keys());

// Checker
export const OBJECT_SHAPE_PREFIX = "object:";

// Formatter
export const INDENT = "    ";

export const CONTAINER_TYPES = new Set([
	AST_NODE.program,
	AST_NODE.blockStatement,
	AST_NODE.enumDeclaration,
	AST_NODE.typeDeclaration,
	AST_NODE.switchStatement,
]);

export const STATEMENT_TYPES = new Set([
	AST_NODE.variableDeclaration,
	AST_NODE.expressionStatement,
	AST_NODE.returnStatement,
	AST_NODE.whileStatement,
	AST_NODE.forStatement,
	AST_NODE.doWhileStatement,
	AST_NODE.ifStatement,
	AST_NODE.enumDeclaration,
	AST_NODE.typeDeclaration,
	AST_NODE.importDeclaration,
	AST_NODE.switchStatement,
	AST_NODE.breakStatement,
]);

// Project
export const UTF8 = "utf-8";
export const JSON_INDENTATION = 2;
export const CONFIG_FILE = "config.json";
export const PROJECT_TYPE = "project";
export const LIBRARY_PROJECT_TYPE = "library";
export const CORE_LIBRARIES_DIRECTORY_NAME = "core";
export const E95_EXTENSION = ".e95";
export const MAIN_FILE = "main.e95";
export const BUILD_DIRECTORY_NAME = "build";
export const MODULES_DIRECTORY_NAME = "modules";
export const LIBRARIES_DIRECTORY_NAME = "libraries";
export const STRATEGIES_DIRECTORY_NAME = "strategies";
export const ENTRY_OPTION = "--entry";
export const POST_INSTALL_FILE = "post-install.js";
export const LIBRARY_FILE_PREFIX = "core_";
export const MODULE_PREFIX = "mod_";
export const HEADER_EXTENSION = ".h";
export const SOURCE_EXTENSION = ".cpp";
export const UNKNOWN = "unknown";

// Strategy shared
export const SERIAL_TYPE = "Serial";
export const SPECIAL_LIBRARY_TYPES = new Set([SERIAL_TYPE]);
export const ENUM_C_TYPE_PREFIX = "_e95_";
export const ENUM_TYPES_MARKER = "_e95_replace_enumTypes";
export const SETUP_MARKER = "// SETUP";
export const MAIN_MARKER = "// MAIN";
export const CORE_MARKER = "// CORE";
export const LIBRARIES_MARKER = "// LIBRARIES";
export const MODULES_MARKER = "// MODULES";

export const DATA_TYPE_TO_C_TYPE = {
	[DATA_TYPE.u8]: "u8",
	[DATA_TYPE.i8]: "i8",
	[DATA_TYPE.u16]: "u16",
	[DATA_TYPE.i16]: "i16",
	[DATA_TYPE.u32]: "u32",
	[DATA_TYPE.i32]: "i32",
	[DATA_TYPE.u64]: "u64",
	[DATA_TYPE.i64]: "i64",
	[DATA_TYPE.i128]: "i128",
	[DATA_TYPE.u128]: "u128",
	[DATA_TYPE.f32]: "f32",
	[DATA_TYPE.f64]: "f64",
	[DATA_TYPE.char]: "char",
	[DATA_TYPE.boolean]: "boolean",
	[DATA_TYPE.string]: "core_string::String",
	[DATA_TYPE.void]: "void",
};

export const ENUM_UNDERLYING_C_TYPE = {
	[DATA_TYPE.u8]: "u8",
	[DATA_TYPE.i8]: "i8",
	[DATA_TYPE.u16]: "u16",
	[DATA_TYPE.i16]: "i16",
	[DATA_TYPE.u32]: "u32",
	[DATA_TYPE.i32]: "i32",
	[DATA_TYPE.u64]: "u64",
	[DATA_TYPE.i64]: "i64",
	[DATA_TYPE.i128]: "__int128",
	[DATA_TYPE.u128]: "unsigned __int128",
};

export const ANONYMOUS_OBJECT_FALLBACK_NAME = "AnonymousObject";
