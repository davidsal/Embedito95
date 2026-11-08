import {
	createConnection,
	ProposedFeatures,
} from "vscode-languageserver/node.js";
import { createServer } from "./server/index.js";

const connection = createConnection(ProposedFeatures.all);

createServer(connection);

connection.listen();
