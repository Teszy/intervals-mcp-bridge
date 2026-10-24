import {
  getActivityStreamStatisticsInputSchema,
  getActivityStreamStatisticsOutputSchema,
} from './get-activity-stream-statistics.schemas.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { calculateActivityStreamStatistics } from '../../app/activity-streams/statistics.js';
import { toolHandler } from '../tool-handler.js';

export function registerGetActivityStreamStatisticsTool(
  server: McpServer,
  client: IntervalsApi,
): void {
  server.registerTool(
    'get_activity_stream_statistics',
    {
      title: 'Activity stream statistics',
      description:
        'Calculate duration-weighted means, observed minima/maxima and data coverage from full-resolution streams, never sampled points. Optional elapsed startTime/endTime clips the window. Each value applies until the next timestamp; gaps greater than maxGapSeconds (default 30) are excluded, and the final value has no duration. Nulls are excluded from means; missingSeconds and gapSeconds report unknown time. Optional zones use strictly increasing boundaries in the stream units: values equal to a boundary enter the higher zone. Use athlete-specific boundaries supplied by the user; do not invent zones. Results include stopped time and may differ from Intervals moving-time metrics. For distance, weightedMean describes cumulative distance, not speed or distance travelled.',
      inputSchema: getActivityStreamStatisticsInputSchema,
      outputSchema: getActivityStreamStatisticsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    toolHandler(async ({ activityId, types, startTime, endTime, maxGapSeconds, zones }) => ({
      activityId,
      ...calculateActivityStreamStatistics(await client.getActivityStreams(activityId, types), {
        startTime,
        endTime,
        maxGapSeconds,
        zones,
      }),
    })),
  );
}
