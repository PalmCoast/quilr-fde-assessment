import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCustomerServer } from "./createServer.js";
import { logError, logInfo } from "./log.js";

const server = createCustomerServer();
const transport = new StdioServerTransport();

logInfo("starting stdio MCP server");

try {
  await server.connect(transport);
} catch (error) {
  logError("failed to start stdio server");
  process.exitCode = 1;
  throw error;
}
