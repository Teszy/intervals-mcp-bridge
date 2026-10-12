import { McpServer } from '@modelcontextprotocol/server';
import packageInfo from '../../package.json' with { type: 'json' };
import { IntervalsClient } from '../intervals/client.js';
import type { IntervalsConfig } from '../intervals/config.js';
import { registerGetActivityTool } from './tools/get-activity.js';
import { registerGetRecentActivitiesTool } from './tools/get-recent-activities.js';

/** Build the tool registry without opening a transport or making API requests. */
export function createServer(config: IntervalsConfig): McpServer {
  const client = new IntervalsClient(config);
  const server = new McpServer({ name: packageInfo.name, version: packageInfo.version });
  registerGetRecentActivitiesTool(server, client);
  registerGetActivityTool(server, client);
  return server;
}
