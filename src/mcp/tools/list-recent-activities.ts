import { z } from 'zod';
import { activitySummarySchema } from '../../schemas/activities.js';
import { athleteDateRangeSchema } from '../../schemas/date-range.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { toolHandler } from '../tool-handler.js';

const listRecentActivitiesInputSchema = athleteDateRangeSchema.refine(
  ({ oldest, newest }) => Date.parse(newest) - Date.parse(oldest) < 365 * 86_400_000,
  {
    message: 'Request at most 365 inclusive calendar days at a time.',
    path: ['newest'],
  },
);

const listRecentActivitiesOutputSchema = z.object({
  oldest: z.iso.date(),
  newest: z.iso.date(),
  activities: z.array(activitySummarySchema),
});

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
