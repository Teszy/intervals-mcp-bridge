import {
  getActivityStreamPageInputSchema,
  getActivityStreamPageOutputSchema,
} from './get-activity-stream-page.schemas.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { createActivityStreamPage } from '../../app/activity-streams/page.js';
import { toolHandler } from '../tool-handler.js';

export function registerGetActivityStreamPageTool(server: McpServer, client: IntervalsApi): void {
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
    toolHandler(async ({ activityId, types, pageSize, offset, startTime, endTime }) => {
      const data = await client.getActivityStreams(activityId, types);
      return {
        activityId,
        ...createActivityStreamPage(data, { pageSize, offset, startTime, endTime }),
      };
    }),
  );
}
