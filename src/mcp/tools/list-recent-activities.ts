import {
  listRecentActivitiesInputSchema,
  listRecentActivitiesOutputSchema,
} from '../../schemas/mcp/tools/list-recent-activities.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { toolResult } from '../result.js';

export function registerListRecentActivitiesTool(server: McpServer, client: IntervalsApi): void {
  server.registerTool(
    'list_recent_activities',
    {
      title: 'Recent activities',
      description:
        'List recent Intervals.icu activities for the configured athlete to find activity IDs for the details and stream tools. Includes today; date bounds use UTC. Distance is in meters and moving_time in seconds.',
      inputSchema: listRecentActivitiesInputSchema,
      outputSchema: listRecentActivitiesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ days }) => toolResult(async () => ({ activities: await client.getRecentActivities(days) })),
  );
}
