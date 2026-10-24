import { AppError } from './errors.js';
import { loadIntervalsConfig } from './intervals/config.js';
import { startServer } from './mcp/server.js';

try {
  const config = loadIntervalsConfig();
  startServer(config);
} catch (error: unknown) {
  const message = error instanceof AppError ? error.message : 'Unexpected internal error.';
  console.error(`Unable to start MCP server: ${message}`);
  process.exitCode = 1;
}
