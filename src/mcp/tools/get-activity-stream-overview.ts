import {
  getActivityStreamOverviewInputSchema,
  getActivityStreamOverviewOutputSchema,
} from '../../schemas/mcp/tools/get-activity-stream-overview.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsClient } from '../../intervals/client.js';

import { createActivityStreamOverview } from '../../app/activity-streams/overview.js';
import { toolResult } from '../result.js';

export function registerGetActivityStreamOverviewTool(
  server: McpServer,
  client: IntervalsClient,
): void {
  server.registerTool(
    'get_activity_stream_overview',
    {
      title: 'Activity stream overview',
      description:
        'Fetch selected measurements over elapsed time for an activity ID from list_recent_activities. Time and stream arrays share indices; null values are missing, not zero. Defaults to heart rate, speed, power and cadence, capped at 200 points. If sampled=true, points are evenly selected by sample index, preserving the window endpoints; peaks and short efforts may be missed. Use startTime/endTime to inspect an interval in greater detail. Use get_activity_stream_page for consecutive original points without sampling. Use get_activity_stream_statistics for calculated statistics; do not infer exact averages, peaks or time in zones from sampled data. Speeds are meters/second; running pace in seconds/km is 1000/speed when speed is positive.',
      inputSchema: getActivityStreamOverviewInputSchema,
      outputSchema: getActivityStreamOverviewOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ activityId, types, maxPoints, startTime, endTime }) =>
      toolResult(async () => {
        const data = await client.getActivityStreams(activityId, types);
        return {
          activityId,
          ...createActivityStreamOverview(data, { maxPoints, startTime, endTime }),
        };
      }, 'Unable to retrieve valid activity streams. The data may be unavailable through the Intervals API.'),
  );
}
