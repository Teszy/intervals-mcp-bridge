import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../../intervals/api.js';
import { toolHandler } from '../shared/tool-handler.js';
import { listRecentActivitiesInputSchema, listRecentActivitiesOutputSchema } from './schemas.js';

export function registerListRecentActivitiesTool(server: McpServer, client: IntervalsApi): void {
  server.registerTool(
    'list_recent_activities',
    {
      title: 'Recent activities',
      description:
        'List Intervals.icu activities in an inclusive athlete-local date range (oldest/newest YYYY-MM-DD, maximum 365 days) to find activity IDs for the details and stream tools. Use get_athlete_settings for the athlete timezone when resolving relative dates. Distance is in meters and moving_time in seconds.',
      inputSchema: listRecentActivitiesInputSchema,
      outputSchema: listRecentActivitiesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    toolHandler(async ({ oldest, newest }, ctx) => ({
      oldest,
      newest,
      activities: await client.getRecentActivities({ oldest, newest }, ctx.mcpReq.signal),
    })),
  );
}
