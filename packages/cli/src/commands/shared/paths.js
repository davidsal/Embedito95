export const getCurrentWorkingDirectory = () => {
	return process.env.INIT_CWD || process.cwd();
};
