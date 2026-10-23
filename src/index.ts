import { AppError } from './errors.js';
import { startStdioServer } from './mcp/stdio.js';
import { loadIntervalsConfig } from './intervals/config.js';
import { createServer } from './mcp/server.js';

try {
  const config = loadIntervalsConfig();
  const handle = startStdioServer(() => createServer(config));
  const shutdown = () => {
    // The lifecycle wrapper has already marked and reported any close failure.
    void handle.close().catch(() => {});
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error: unknown) {
  const message = error instanceof AppError ? error.message : 'Unexpected internal error.';
  console.error(`Unable to start MCP server: ${message}`);
  process.exitCode = 1;
}
