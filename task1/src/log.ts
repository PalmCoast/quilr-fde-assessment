/** MCP stdio servers must keep stdout reserved for JSON-RPC. */
export function logInfo(message: string, extra?: Record<string, unknown>): void {
  const line = extra ? `${message} ${JSON.stringify(extra)}` : message;
  process.stderr.write(`[task1] ${line}\n`);
}

export function logError(message: string, extra?: Record<string, unknown>): void {
  const line = extra ? `${message} ${JSON.stringify(extra)}` : message;
  process.stderr.write(`[task1:error] ${line}\n`);
}
