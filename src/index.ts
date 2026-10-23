import { AppError } from './errors.js';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadIntervalsConfig } from './intervals/config.js';
import { createServer } from './mcp/server.js';

try {
  const config = loadIntervalsConfig();
  const handle = serveStdio(() => createServer(config), {
    onerror: () => console.error('MCP transport error.'),
  });
  const shutdown = () => {
    void handle.close().catch(() => {
      console.error('Unable to close MCP transport.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error: unknown) {
  const message = error instanceof AppError ? error.message : 'Unexpected internal error.';
  console.error(`Unable to start MCP server: ${message}`);
  process.exitCode = 1;
}
