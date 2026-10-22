import {
  getActivityStreamPageInputSchema,
  getActivityStreamPageOutputSchema,
} from '../../schemas/mcp/tools/get-activity-stream-page.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsClient } from '../../intervals/client.js';

import { activityStreamUnits } from '../../schemas/streams.js';
import { toolResult } from '../result.js';

export function registerGetActivityStreamPageTool(
  server: McpServer,
  client: IntervalsClient,
): void {
  server.registerTool(
    'get_activity_stream_page',
    {
      title: 'Activity stream page',
      description:
        'Retrieve consecutive original measurements without sampling for detailed inspection or lossless traversal. Returns 200 points per page by default (maximum 500). Optional startTime/endTime bounds are inclusive elapsed seconds. Start at offset=0; continue with nextOffset until it is null, keeping activityId, types and time bounds unchanged. Offsets count points in the filtered window, not seconds. Time and stream arrays share indices; null means missing, not zero. Each call fetches current upstream data, so activity changes during traversal can shift pages. Use get_activity_stream_overview for a compact sampled overview and get_activity_stream_statistics for statistics from full-resolution data. Speeds are meters/second.',
      inputSchema: getActivityStreamPageInputSchema,
      outputSchema: getActivityStreamPageOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ activityId, types, pageSize, offset, startTime, endTime }) =>
      toolResult(async () => {
        const data = await client.getActivityStreams(activityId, types);
        const indices = data.time.flatMap((time, index) =>
          time >= (startTime ?? 0) && (endTime === undefined || time <= endTime) ? [index] : [],
        );
        const selected = indices.slice(offset, offset + pageSize);
        const hasMore = offset + selected.length < indices.length;
        return {
          activityId,
          time: selected.map((index) => data.time[index]!),
          streams: data.streams.map((stream) => ({
            type: stream.type,
            unit: activityStreamUnits[stream.type],
            data: selected.map((index) => stream.data[index]!),
          })),
          missingStreams: data.missingStreams,
          totalPoints: data.time.length,
          windowPoints: indices.length,
          returnedPoints: selected.length,
          offset,
          nextOffset: hasMore ? offset + selected.length : null,
          hasMore,
        };
      }, 'Unable to retrieve valid activity streams. The data may be unavailable through the Intervals API.'),
  );
}
