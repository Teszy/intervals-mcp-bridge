import { z } from 'zod';
import { activitySummarySchema } from '../../schemas/activities.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { toolHandler } from '../tool-handler.js';

const listRecentActivitiesInputSchema = z.strictObject({
  // Number of recent UTC calendar dates to include, counting today.
  days: z.number().int().min(1).max(365).default(7),
});

const listRecentActivitiesOutputSchema = z.object({
  activities: z.array(activitySummarySchema),
});

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
    toolHandler(async ({ days }) => ({ activities: await client.getRecentActivities(days) })),
  );
}
