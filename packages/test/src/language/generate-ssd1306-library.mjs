import { join } from "node:path";
import {
	CLIENT_LIBRARY_DIRECTORY,
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const SSD1306_PACKAGE = "@embedito95/ssd1306";
const SSD1306_LIBRARY_PATH = join(
	CLIENT_LIBRARY_DIRECTORY,
	"ssd1306",
	"main.e95",
);
const I2C_PACKAGE = "@embedito95/i2c";
const I2C_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "i2c", "main.e95");
const SPI_PACKAGE = "@embedito95/spi";
const SPI_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "spi", "main.e95");
const GPIO_PACKAGE = "@embedito95/gpio";
const GPIO_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "gpio", "main.e95");
const I2C_ENUM_MARKER = "// e95.postinstall.i2cEnum";
const SPI_ENUM_MARKER = "// e95.postinstall.spiEnum";
const GPIO_PIN_ENUM_MARKER = "// e95.postinstall.pinEnum";
const BUS_ENUM_SAMPLE_MEMBER = "1,";
const AVR_PIN_ENUM_SAMPLE_MEMBERS = "2,\n    3,\n    9,\n    10,";
const AVR_CHIP_SELECT_PIN_NAME = "10";
const AVR_DATA_COMMAND_PIN_NAME = "9";

// The ssd1306 factories take `I2C`, `SPI` and `Pin`, so the context needs the
// declarations of those core libraries to resolve the enum members and report
// the argument types, exactly like the editor does after installing them.
const addLibraryContext = (context, dependencyContext, packageName) => {
	context.libraries.knownLibraries.add(packageName);
	context.libraries.libraryExports[packageName] =
		dependencyContext.libraries.libraryExports[packageName];
	context.libraries.libraryTypes[packageName] =
		dependencyContext.libraries.libraryTypes[packageName];
	context.libraries.libraryEnumInfo[packageName] =
		dependencyContext.libraries.libraryEnumInfo[packageName];
	return context;
};

const buildReport = () => {
	const ssd1306Context = readLibraryContext({
		libraryPath: SSD1306_LIBRARY_PATH,
		packageName: SSD1306_PACKAGE,
	});
	const i2cContext = readLibraryContext({
		libraryPath: I2C_LIBRARY_PATH,
		packageName: I2C_PACKAGE,
		marker: I2C_ENUM_MARKER,
		sample: BUS_ENUM_SAMPLE_MEMBER,
	});
	const spiContext = readLibraryContext({
		libraryPath: SPI_LIBRARY_PATH,
		packageName: SPI_PACKAGE,
		marker: SPI_ENUM_MARKER,
		sample: BUS_ENUM_SAMPLE_MEMBER,
	});
	const gpioContext = readLibraryContext({
		libraryPath: GPIO_LIBRARY_PATH,
		packageName: GPIO_PACKAGE,
		marker: GPIO_PIN_ENUM_MARKER,
		sample: AVR_PIN_ENUM_SAMPLE_MEMBERS,
	});
	const context = addLibraryContext(
		addLibraryContext(
			addLibraryContext(ssd1306Context, i2cContext, I2C_PACKAGE),
			spiContext,
			SPI_PACKAGE,
		),
		gpioContext,
		GPIO_PACKAGE,
	);
	const cases = [
		{
			label: "getDisplayI2C infers Ssd1306Display",
			probes: ["display"],
			body: `import { I2C } from '@embedito95/i2c'
import { getDisplayI2C } from '@embedito95/ssd1306'
export const display = getDisplayI2C(I2C.1)`,
		},
		{
			label: "getDisplaySPI infers Ssd1306Display",
			probes: ["display"],
			body: `import { SPI } from '@embedito95/spi'
import { Pin } from '@embedito95/gpio'
import { getDisplaySPI } from '@embedito95/ssd1306'
export const display = getDisplaySPI(SPI.1, Pin.${AVR_CHIP_SELECT_PIN_NAME}, Pin.${AVR_DATA_COMMAND_PIN_NAME})`,
		},
		{
			label: "both factories share the Ssd1306Display type",
			probes: ["i2cDisplay"],
			body: `import { I2C } from '@embedito95/i2c'
import { SPI } from '@embedito95/spi'
import { Pin } from '@embedito95/gpio'
import { Ssd1306Display, getDisplayI2C, getDisplaySPI } from '@embedito95/ssd1306'
export const i2cDisplay = getDisplayI2C(I2C.1)
const render = (display: Ssd1306Display) => {
    display.clearDisplay()
    display.write("Embedito95")
}
export const renderSpi = () => {
    render(getDisplaySPI(SPI.1, Pin.${AVR_CHIP_SELECT_PIN_NAME}, Pin.${AVR_DATA_COMMAND_PIN_NAME}))
}`,
		},
		{
			label: "an SPI display accepts the same text calls as an I2C one",
			probes: ["spiText"],
			body: `import { SPI } from '@embedito95/spi'
import { Pin } from '@embedito95/gpio'
import { getDisplaySPI } from '@embedito95/ssd1306'
const display = getDisplaySPI(SPI.1, Pin.${AVR_CHIP_SELECT_PIN_NAME}, Pin.${AVR_DATA_COMMAND_PIN_NAME})
display.initialize()
display.setTextScale(2)
display.setCursor(0, 0)
display.write("Hello")
export const spiText = display`,
		},
		{
			label: "nested display configuration produces no diagnostics",
			probes: ["nested"],
			body: `import { I2C } from '@embedito95/i2c'
import { getDisplayI2C } from '@embedito95/ssd1306'
const display = getDisplayI2C(I2C.1)
const choose = (value: u8): u8 => {
    if (value > 0) {
        if (value > 10) {
            display.setCursor(0, 16)
            display.write("large")
            return 2
        }
        display.setCursor(0, 0)
        display.write("small")
        return 1
    }
    display.clearDisplay()
    return 0
}
export const nested = choose(5)`,
		},
		{
			label: "wrong SPI argument count reported",
			probes: [],
			body: `import { SPI } from '@embedito95/spi'
import { Pin } from '@embedito95/gpio'
import { getDisplaySPI } from '@embedito95/ssd1306'
export const badCount = () => {
    getDisplaySPI(SPI.1, Pin.${AVR_CHIP_SELECT_PIN_NAME})
}`,
		},
		{
			label: "non-pin chip select reported",
			probes: ["badChipSelect"],
			body: `import { SPI } from '@embedito95/spi'
import { getDisplaySPI } from '@embedito95/ssd1306'
export const badChipSelect = getDisplaySPI(SPI.1, 5, 6)`,
		},
		{
			label: "unknown method reported and left unresolved",
			probes: ["missing"],
			body: `import { I2C } from '@embedito95/i2c'
import { getDisplayI2C } from '@embedito95/ssd1306'
const display = getDisplayI2C(I2C.1)
export const missing = display.scroll(1)`,
		},
	];

	const header = [
		"// LSP view of the `ssd1306` library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real libraries/ssd1306/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"// The installed AVR view is injected at the postinstall markers, so the",
		"// SPI cases use D10 as chip select and D9 as data/command.",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listSsd1306LibrarySnapshots = () => {
	return listSnapshots("ssd1306-library.txt", buildReport());
};

export const writeSsd1306LibrarySnapshots = () => {
	writeSnapshots(listSsd1306LibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeSsd1306LibrarySnapshots();
	console.log("Generated ssd1306-library.txt");
}
