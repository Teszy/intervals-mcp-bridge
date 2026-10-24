import { AppError } from './errors.js';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadIntervalsConfig } from './intervals/config.js';
import { createServer } from './mcp/server.js';

try {
  const config = loadIntervalsConfig();
  const handle = serveStdio(() => createServer(config), {
    onerror: (error) => console.error('MCP server error:', error),
  });
  const shutdown = () => {
    void handle.close().catch(() => {
      console.error('Unable to close MCP server.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown); // Handle Ctrl+C gracefully
  process.once('SIGTERM', shutdown); // Handle termination signal gracefully (Docker, Kubernetes, etc.)
} catch (error: unknown) {
  const message = error instanceof AppError ? error.message : 'Unexpected internal error.';
  console.error(`Unable to start MCP server: ${message}`);
  process.exitCode = 1;
}
