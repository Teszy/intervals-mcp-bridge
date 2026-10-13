import { registerGetAthleteSettingsTool } from './tools/get-athlete-settings.js';
import { McpServer } from '@modelcontextprotocol/server';
import packageInfo from '../../package.json' with { type: 'json' };
import { IntervalsClient } from '../intervals/client.js';
import type { IntervalsConfig } from '../intervals/config.js';
import { registerGetActivityDetailsTool } from './tools/get-activity-details.js';
import { registerGetActivityStreamPageTool } from './tools/get-activity-stream-page.js';
import { registerGetActivityStreamOverviewTool } from './tools/get-activity-stream-overview.js';
import { registerGetActivityStreamStatisticsTool } from './tools/get-activity-stream-statistics.js';
import { registerListRecentActivitiesTool } from './tools/list-recent-activities.js';

/** Build the tool registry without opening a transport or making API requests. */
export function createServer(config: IntervalsConfig): McpServer {
  const client = new IntervalsClient(config);
  const server = new McpServer({ name: packageInfo.name, version: packageInfo.version });
  registerListRecentActivitiesTool(server, client);
  registerGetActivityDetailsTool(server, client);
  registerGetActivityStreamOverviewTool(server, client);
  registerGetActivityStreamPageTool(server, client);
  registerGetActivityStreamStatisticsTool(server, client);
  registerGetAthleteSettingsTool(server, client);
  return server;
}
