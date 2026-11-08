export const buildLibraryFunctionReturnTypes = (libraryFunctions) => {
	const libFunctionReturnTypes = {};
	for (const functions of Object.values(libraryFunctions)) {
		for (const [name, definition] of Object.entries(functions)) {
			if (definition?.returnType) {
				libFunctionReturnTypes[name] = definition.returnType;
			}
		}
	}
	return libFunctionReturnTypes;
};

export const flattenLibraryObjectTypes = (libraryObjectTypes) => {
	const objectTypes = {};
	for (const types of Object.values(libraryObjectTypes)) {
		for (const [typeName, definition] of Object.entries(types)) {
			objectTypes[typeName] = definition;
		}
	}
	return objectTypes;
};
