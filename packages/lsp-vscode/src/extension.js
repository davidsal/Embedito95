import { join } from "node:path";
// biome-ignore lint/performance/noNamespaceImport: the VS Code API is only available as a namespace
import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

const LANGUAGE_CLIENT_ID = "embedito95";
const LANGUAGE_ID = "e95";
const LANGUAGE_SERVER_NAME = "Embedito95 Language Server";
const SERVER_DIRECTORY_NAME = "server";
const SERVER_BUNDLE_FILE_NAME = "server.cjs";
const STDIO_FLAG = "--stdio";
const ACTIVATION_MESSAGE = "Extension activated";
const STARTING_CLIENT_MESSAGE = "Starting client...";
const CLIENT_STARTED_MESSAGE = "Client started";
const ACTIVATION_ERROR_PREFIX = "Activation error: ";

const extensionState = {
	languageClient: undefined,
};

const createLanguageClient = (context) => {
	return new LanguageClient(
		LANGUAGE_CLIENT_ID,
		LANGUAGE_SERVER_NAME,
		{
			command: process.execPath,
			args: [
				context.asAbsolutePath(
					join(SERVER_DIRECTORY_NAME, SERVER_BUNDLE_FILE_NAME),
				),
				STDIO_FLAG,
			],
		},
		{
			documentSelector: [{ language: LANGUAGE_ID }],
		},
	);
};

const startLanguageClient = (context, outputChannel) => {
	const languageClient = createLanguageClient(context);
	extensionState.languageClient = languageClient;
	outputChannel.appendLine(STARTING_CLIENT_MESSAGE);
	const disposable = languageClient.start();
	outputChannel.appendLine(CLIENT_STARTED_MESSAGE);
	context.subscriptions.push(disposable);
};

export const activate = (context) => {
	const outputChannel = vscode.window.createOutputChannel(LANGUAGE_SERVER_NAME);
	outputChannel.appendLine(ACTIVATION_MESSAGE);
	context.subscriptions.push(outputChannel);

	try {
		startLanguageClient(context, outputChannel);
	} catch (error) {
		outputChannel.appendLine(
			`${ACTIVATION_ERROR_PREFIX}${error?.message ?? error}`,
		);
	}
};

export const deactivate = () => {
	return extensionState.languageClient?.stop();
};
