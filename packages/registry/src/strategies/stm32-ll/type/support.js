import { FLOAT64_MODE } from "../../../platforms/enums.js";
import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "type.h",
});

const NATIVE_F64_ALIAS = "using f64 = double;";
const SOFTWARE_F64_ALIAS = "using f64 = _e95_f64;";
const F64_INCLUDE_MARKER = "_e95_replace_f64Include\n";
const F64_INCLUDE = "#include <core_f64.h>\n";

const renderInclude = () => {
	return renderArtifactInclude("type");
};

const isSoftwareFloat64 = (platform) => {
	return platform?.float64 === FLOAT64_MODE.SOFTWARE;
};

const generateSupport = (platform) => {
	if (!isSoftwareFloat64(platform)) {
		return TEMPLATE.replace(F64_INCLUDE_MARKER, "");
	}
	return TEMPLATE.replace(NATIVE_F64_ALIAS, SOFTWARE_F64_ALIAS).replace(
		F64_INCLUDE_MARKER,
		F64_INCLUDE,
	);
};

export const definition = {
	name: "stm32-ll",
	renderInclude,
	generateSupport,
};
