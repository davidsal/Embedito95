import { DATA_TYPE, formatExpression } from "embedito95-core";
import { formatDocComment } from "../shared/doc-comments.js";
import {
	getLibraryDocComment,
	getLibraryEnumMemberDoc,
} from "../shared/library-docs.js";
import { formatPeripheralMemberHover } from "./formatting.js";
import { NOT_HANDLED } from "./local-steps.js";

const findLibraryExport = (context) => {
	const { allExports, hoverPlatform } = context;
	const originalName = context.importAliases.get(context.name) ?? context.name;
	const matchedExport = allExports.find((exportItem) => {
		return exportItem.name === originalName;
	});

	if (matchedExport) {
		return matchedExport;
	}

	if (
		!context.memberEnumName &&
		hoverPlatform?.pins &&
		context.name in hoverPlatform.pins
	) {
		return {
			name: context.name,
			library: "@embedito95/gpio",
			kind: "constant",
			type: "Pin",
		};
	}

	return null;
};

const resolveEnumTypeForMember = (context, enumMembers) => {
	const { hoverPlatform } = context;

	if (context.memberEnumName) {
		return [context.memberEnumName, enumMembers[context.memberEnumName]];
	}

	const memberEnumEntry = Object.entries(enumMembers).find(([, memberList]) => {
		return memberList.includes(context.name);
	});

	if (memberEnumEntry) {
		return memberEnumEntry;
	}

	if (hoverPlatform?.pins && context.name in hoverPlatform.pins) {
		return ["Pin", Object.keys(hoverPlatform.pins)];
	}

	return null;
};

const formatLibraryParameter = (parameter) => {
	const typeSuffix = parameter.type ? `: ${parameter.type}` : "";
	if (!parameter.defaultValue) {
		return `${parameter.name}${typeSuffix}`;
	}

	return `${parameter.name}?${typeSuffix} = ${formatExpression(parameter.defaultValue)}`;
};

const buildLibraryFunctionHover = (context, libraryExport, docSection) => {
	const parameters = libraryExport.params
		?.map(formatLibraryParameter)
		.join(", ");
	const returnType = libraryExport.returnType ?? DATA_TYPE.void;
	const signature = `\`\`\`e95\nconst ${context.name}(${parameters}): ${returnType}\n\`\`\``;

	return {
		contents: {
			kind: "markdown",
			value: signature + docSection,
		},
	};
};

const formatEnumMembersSection = (members) => {
	if (members.length === 0) {
		return "";
	}

	const memberLines = members.map((member) => `- ${member}`).join("\n");
	return `\n\n**Members:**\n${memberLines}`;
};

const buildEnumExportHover = (context, enumMembers, docSection) => {
	const { hoverPlatform } = context;
	const isEnumExport =
		enumMembers[context.name] ||
		(context.name === "Pin" && hoverPlatform?.pins);

	if (!isEnumExport) {
		return null;
	}

	const pinKeys =
		context.name === "Pin" && !enumMembers[context.name]?.length
			? Object.keys(hoverPlatform.pins)
			: null;
	const members = pinKeys ?? enumMembers[context.name] ?? [];
	const signature = `\`\`\`e95\nenum ${context.name}\n\`\`\``;

	return {
		contents: {
			kind: "markdown",
			value: signature + docSection + formatEnumMembersSection(members),
		},
	};
};

const buildEnumMemberConstantHover = (
	context,
	libraryExport,
	enumTypeForMember,
) => {
	if (!enumTypeForMember) {
		return null;
	}

	const [enumType] = enumTypeForMember;
	const memberDocumentation = getLibraryEnumMemberDoc(
		context.documentUri,
		libraryExport.library,
		context.name,
	);
	const signature =
		"```e95\n" +
		enumType +
		"." +
		context.name +
		": " +
		libraryExport.type +
		"\n```";

	return {
		contents: {
			kind: "markdown",
			value: signature + formatDocComment(memberDocumentation),
		},
	};
};

const buildConstantValueHover = (context, libraryExport, docSection) => {
	const { hoverPlatform } = context;
	const hoveredPin = hoverPlatform?.pins?.[context.name];
	const pinNumber = Number(context.name);
	const resolvedValue = hoveredPin
		? Number.isNaN(pinNumber)
			? (hoveredPin.name ?? context.name)
			: pinNumber
		: undefined;
	const valueSuffix =
		resolvedValue !== undefined ? ` = ${JSON.stringify(resolvedValue)}` : "";
	const signature = `\`\`\`e95\nconst ${context.name}: ${libraryExport.type}${valueSuffix}\n\`\`\``;

	return {
		contents: {
			kind: "markdown",
			value: signature + docSection,
		},
	};
};

export const resolveLibraryExportHover = (context) => {
	const { allExports } = context;
	const libraryExport = findLibraryExport(context);

	if (!libraryExport) {
		return NOT_HANDLED;
	}

	const enumMembers = allExports.enumMembers ?? {};
	const docComment = getLibraryDocComment(
		context.documentUri,
		libraryExport.library,
		context.name,
	);
	const docSection = formatDocComment(docComment);

	if (libraryExport.kind === "function") {
		return buildLibraryFunctionHover(context, libraryExport, docSection);
	}

	if (libraryExport.kind === "constant") {
		const enumExportHover = buildEnumExportHover(
			context,
			enumMembers,
			docSection,
		);

		if (enumExportHover) {
			return enumExportHover;
		}

		const enumMemberHover = buildEnumMemberConstantHover(
			context,
			libraryExport,
			resolveEnumTypeForMember(context, enumMembers),
		);

		if (enumMemberHover) {
			return enumMemberHover;
		}

		return buildConstantValueHover(context, libraryExport, docSection);
	}

	return NOT_HANDLED;
};

const resolvePeripheralHover = (
	signature,
	enumType,
	hoverPlatform,
	contextName,
) => {
	if (enumType === "Serial") {
		const serialEntry = hoverPlatform?.serial?.available?.find((entry) => {
			return String(entry?.number) === contextName;
		});

		if (serialEntry) {
			const fields = [`**RX:** ${serialEntry.rx}`, `**TX:** ${serialEntry.tx}`];

			if (serialEntry.baudRates?.length) {
				fields.push(`**Baud rates:** ${serialEntry.baudRates.join(", ")}`);
			}

			return formatPeripheralMemberHover(
				signature,
				serialEntry.name ?? enumType,
				fields,
			);
		}
	}

	if (enumType === "I2C") {
		const i2cEntry = hoverPlatform?.i2c?.available?.find((entry) => {
			return String(entry?.number) === contextName;
		});

		if (i2cEntry) {
			return formatPeripheralMemberHover(signature, i2cEntry.name ?? enumType, [
				`**SDA:** ${i2cEntry.sda}`,
				`**SCL:** ${i2cEntry.scl}`,
			]);
		}
	}

	if (enumType === "SPI") {
		const spiEntry = hoverPlatform?.spi?.available?.find((entry) => {
			return String(entry?.number) === contextName;
		});

		if (spiEntry) {
			return formatPeripheralMemberHover(signature, spiEntry.name ?? enumType, [
				`**MOSI:** ${spiEntry.mosi}`,
				`**MISO:** ${spiEntry.miso}`,
				`**SCK:** ${spiEntry.sck}`,
				`**SS:** ${spiEntry.ss}`,
			]);
		}
	}

	return null;
};

export const resolveEnumMemberHover = (context) => {
	const { allExports, hoverPlatform } = context;
	const enumMembers = allExports.enumMembers ?? {};

	for (const [enumType, memberList] of Object.entries(enumMembers)) {
		if (context.memberEnumName && enumType !== context.memberEnumName) {
			continue;
		}
		if (!memberList.includes(context.name)) {
			continue;
		}

		const libraryName = allExports.find((exportItem) => {
			return exportItem.name === enumType;
		})?.library;
		const memberDocumentation = libraryName
			? getLibraryEnumMemberDoc(context.documentUri, libraryName, context.name)
			: null;
		const memberSection = memberDocumentation
			? formatDocComment(memberDocumentation)
			: "";
		const signature = `\`\`\`e95\n${enumType}.${context.name}: ${enumType}\n\`\`\``;

		const peripheralHover = resolvePeripheralHover(
			signature,
			enumType,
			hoverPlatform,
			context.name,
		);

		if (peripheralHover) {
			return peripheralHover;
		}

		return {
			contents: {
				kind: "markdown",
				value: signature + memberSection,
			},
		};
	}

	return NOT_HANDLED;
};
