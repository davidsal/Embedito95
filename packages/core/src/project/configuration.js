export const readPackageNames = (registeredPackages) => {
	if (!Array.isArray(registeredPackages)) {
		return [];
	}
	return [...registeredPackages];
};

export const appendPackageName = (packageNames, packageName) => {
	if (!packageName || packageNames.includes(packageName)) {
		return packageNames;
	}
	return [...packageNames, packageName];
};
