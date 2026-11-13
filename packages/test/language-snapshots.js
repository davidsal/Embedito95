import { listArbitraryUnionSnapshots } from "./src/language/generate-arbitrary-unions.mjs";
import { listAsyncUsageSnapshots } from "./src/language/generate-async-usage.mjs";
import { listCapturedFieldAccessSnapshots } from "./src/language/generate-captured-field-access.mjs";
import { listConsoleLibrarySnapshots } from "./src/language/generate-console-library.mjs";
import { listEepromLibrarySnapshots } from "./src/language/generate-eeprom-library.mjs";
import { listFunctionReturnTypeSnapshots } from "./src/language/generate-function-return-types.mjs";
import { listGpioLibrarySnapshots } from "./src/language/generate-gpio-library.mjs";
import { listI2CLibrarySnapshots } from "./src/language/generate-i2c-library.mjs";
import { listInterruptLibrarySnapshots } from "./src/language/generate-interrupt-library.mjs";
import { listLibraryStrictnessSnapshots } from "./src/language/generate-library-strictness.mjs";
import { listLocalClosureSnapshots } from "./src/language/generate-local-closure.mjs";
import { listLogicalOperatorSnapshots } from "./src/language/generate-logical-operators.mjs";
import { listMathLibrarySnapshots } from "./src/language/generate-math-library.mjs";
import { listMethodAssignmentSnapshots } from "./src/language/generate-method-assignment.mjs";
import { listMethodOnlyLiteralSnapshots } from "./src/language/generate-method-only-literal.mjs";
import { listMethodReceiverSnapshots } from "./src/language/generate-method-receiver.mjs";
import { listNullableAssignmentsSnapshots } from "./src/language/generate-nullable-assignments.mjs";
import { listObjectSelfReferenceSnapshots } from "./src/language/generate-object-self-reference.mjs";
import { listSerialLibrarySnapshots } from "./src/language/generate-serial-library.mjs";
import { listServoLibrarySnapshots } from "./src/language/generate-servo-library.mjs";
import { listSoftwareSerialLibrarySnapshots } from "./src/language/generate-software-serial-library.mjs";
import { listSpiLibrarySnapshots } from "./src/language/generate-spi-library.mjs";
import { listSsd1306LibrarySnapshots } from "./src/language/generate-ssd1306-library.mjs";
import { listStrictEqualitySnapshots } from "./src/language/generate-strict-equality.mjs";
import { listStringMethodsSnapshots } from "./src/language/generate-string-methods.mjs";
import { listStringMutationSnapshots } from "./src/language/generate-string-mutation.mjs";
import { listSwitchExhaustivenessSnapshots } from "./src/language/generate-switch-exhaustiveness.mjs";
import { listTimerLibrarySnapshots } from "./src/language/generate-timer-library.mjs";
import { listTypeTableSnapshots } from "./src/language/generate-type-table.mjs";
import { listUnusedDeclarationSnapshots } from "./src/language/generate-unused-declarations.mjs";
import { listVariableScopingSnapshots } from "./src/language/generate-variable-scoping.mjs";

export const listLanguageSnapshots = () => {
	return [
		...listTypeTableSnapshots(),
		...listArbitraryUnionSnapshots(),
		...listFunctionReturnTypeSnapshots(),
		...listGpioLibrarySnapshots(),
		...listI2CLibrarySnapshots(),
		...listInterruptLibrarySnapshots(),
		...listConsoleLibrarySnapshots(),
		...listEepromLibrarySnapshots(),
		...listSerialLibrarySnapshots(),
		...listServoLibrarySnapshots(),
		...listSoftwareSerialLibrarySnapshots(),
		...listSpiLibrarySnapshots(),
		...listSsd1306LibrarySnapshots(),
		...listStringMethodsSnapshots(),
		...listStringMutationSnapshots(),
		...listTimerLibrarySnapshots(),
		...listNullableAssignmentsSnapshots(),
		...listMethodAssignmentSnapshots(),
		...listMethodOnlyLiteralSnapshots(),
		...listMethodReceiverSnapshots(),
		...listLocalClosureSnapshots(),
		...listCapturedFieldAccessSnapshots(),
		...listObjectSelfReferenceSnapshots(),
		...listSwitchExhaustivenessSnapshots(),
		...listLogicalOperatorSnapshots(),
		...listMathLibrarySnapshots(),
		...listLibraryStrictnessSnapshots(),
		...listVariableScopingSnapshots(),
		...listUnusedDeclarationSnapshots(),
		...listStrictEqualitySnapshots(),
		...listAsyncUsageSnapshots(),
	];
};
