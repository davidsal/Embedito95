// Init templates
export const TEMPLATE_PROJECT_FILE = "template.e95";
export const TEMPLATE_LIBRARY_FILE = "template-lib.e95";
export const GITIGNORE_CONTENT = "build\ncore\n";
export const PACKAGE_PREFIX = "embedito95-";
export const PACKAGE_FILE = "package.json";
export const HEADER_BOX_WIDTH = 34;
export const HEADER_BORDER_PADDING = 2;

// Documentation
export const DOCS_DIRECTORY_NAME = "docs";
export const DOCS_VERSION_FILE = "VERSION";
export const EXCLUDED_DOC_FILES = new Set(["development.md"]);
export const AGENTS_FILE_NAME = "AGENTS.md";

// Project version
export const VERSION_PREFIX = "embedito95@";
export const SKIP_VERSION_CHECK_ENVIRONMENT_KEY =
	"EMBEDITO95_SKIP_VERSION_CHECK";
export const SKIP_VERSION_CHECK_ENVIRONMENT_VALUE = "1";
export const FORCE_FLAG = "--force";
export const CLI_PACKAGE_NAME = "embedito95-cli";
export const NPX_COMMAND = "npx";
export const NPX_YES_FLAG = "--yes";
export const DELEGATED_ENVIRONMENT_KEY = "EMBEDITO95_DELEGATED";
export const DELEGATED_ENVIRONMENT_VALUE = "1";
export const INHERITED_STDIO = "inherit";
export const WINDOWS_PLATFORM = "win32";
export const WINDOWS_COMMAND_INTERPRETER = "cmd.exe";
export const WINDOWS_COMMAND_INTERPRETER_RUN_FLAG = "/c";

// Process
export const BROKEN_PIPE_ERROR_CODE = "EPIPE";

// Build
export const LIB_PREFIX = "lib_";
export const INTERMEDIATE_DIRECTORY_NAME = "intermediate";

// Terminal input
export const ESCAPE = "\x1b";
export const CSI = `${ESCAPE}[`;
export const CTRL_C = "\x03";
export const ENTER = "\r";
export const BACKSPACE = "\x7f";
export const BACKSPACE_WINDOWS = "\b";
export const ARROW_UP_SEQUENCE = `${CSI}A`;
export const ARROW_DOWN_SEQUENCE = `${CSI}B`;

// Terminal output
export const HIDE_CURSOR = `${CSI}?25l`;
export const SHOW_CURSOR = `${CSI}?25h`;
export const CLEAR_SCREEN = `${CSI}2J`;
export const CURSOR_HOME = `${CSI}H`;
export const CURSOR_TOP_LEFT = `${CSI}1;1H`;
export const ENTER_ALTERNATE_SCREEN = `${CSI}?1049h`;
export const LEAVE_ALTERNATE_SCREEN = `${CSI}?1049l`;
export const ENABLE_MOUSE_TRACKING = `${CSI}?1000h`;
export const ENABLE_SGR_MOUSE = `${CSI}?1006h`;
export const DISABLE_MOUSE_TRACKING = `${CSI}?1000l`;
export const DISABLE_SGR_MOUSE = `${CSI}?1006l`;
export const STYLE_RESET = `${CSI}0m`;
export const STYLE_KEY = `${CSI}38;5;208m`;
export const STYLE_CYAN = `${CSI}36m`;
export const STYLE_DESCRIPTION = `${CSI}39m`;
export const STYLE_SELECTED = `${CSI}7m`;

// Serial configuration
export const DEFAULT_BAUD_RATE = "9600";
export const OTHER_BAUD_RATE = "other";
export const OTHER_BAUD_RATE_LABEL = "Other...";
export const SELECT_PORT_MESSAGE = "Select serial port";
export const BAUD_RATE_MESSAGE = "Baud rate";
export const BAUD_RATE_PATTERN = /^\d+$/;
export const DEFAULT_COLUMNS = 80;
export const DEFAULT_ROWS = 24;
export const PLACEHOLDER_BAUD_RATE = "115200";

// Serial port configuration
export const STTY_FLAGS = ["raw", "-echo", "cs8", "-cstopb", "clocal"];
export const STTY_COMMAND = "stty";
export const PYTHON_COMMAND = "python3";
export const IOSSIOSPEED_IOCTL = 0x80045402;
export const TCFLSH_LINUX = 0x540b;
export const TCFLSH_MACOS = 0x80047410;
export const TCIFLUSH_LINUX = 0;
export const TCIFLUSH_MACOS = 1;

// Serial process
export const DD_COMMAND = "dd";
export const KILL_SIGNAL = "SIGKILL";
export const SETTLING_DURATION_MS = 300;

// Mouse handling
export const CLEAR_KEY = "c";
export const TIME_KEY = "t";
export const SGR_MOUSE_PREFIX = `${ESCAPE}[<`;
export const SGR_MOUSE_REGEX = /^\d+;\d+;\d+[Mm]$/;
export const SGR_PRESS_SUFFIX = "M";
export const SGR_RELEASE_SUFFIX = "m";
export const MOUSE_LEFT_BUTTON = 0;
export const MOUSE_MOTION_FLAG = 32;
export const MOUSE_WHEEL_UP = 64;
export const MOUSE_WHEEL_DOWN = 65;
export const MOUSE_WHEEL_UP_LEGACY = 4;
export const MOUSE_WHEEL_DOWN_LEGACY = 5;
export const MOUSE_COORDINATE_MIN = 1;

// Monitor status bar
export const STATUS_BAR_SEPARATOR = "   ";
export const TITLE_APP_NAME = "Embedito95";
export const TITLE_FEATURE_NAME = "Monitor";
export const STATUS_BAR_BINDINGS = [
	{ key: "esc", description: "exit" },
	{ key: "c", description: "clear" },
	{ key: "t", description: "time" },
];
export const TIME_SEPARATOR = ":";
export const TIME_LENGTH = 9;

// Clipboard
export const COPIED_MESSAGE = "Copied to clipboard";
export const COPY_MESSAGE_DURATION_MS = 1500;

// Patterns
export const CONTROL_CHARACTERS_PATTERN = new RegExp(
	`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
	"g",
);
export const ANSI_CODE_PATTERN = new RegExp(
	`${String.fromCharCode(27)}\\[[0-9;]*m`,
	"g",
);

// Serial window
export const DEFAULT_MAX_LINES = 1000;
