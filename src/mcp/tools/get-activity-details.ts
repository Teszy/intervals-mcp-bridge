import {
  getActivityDetailsInputSchema,
  getActivityDetailsOutputSchema,
} from '../../schemas/mcp/tools/get-activity-details.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { toolHandler } from '../tool-handler.js';

export function registerGetActivityDetailsTool(server: McpServer, client: IntervalsApi): void {
  server.registerTool(
    'get_activity_details',
    {
      title: 'Activity details',
      description:
        'Fetch session metrics and detected work/recovery intervals for an activity. Use an ID from list_recent_activities. Missing or null measurements are unavailable, not zero. Speeds are meters per second; cadence units depend on sport and recording source. Use get_activity_stream_overview for measurements over time.',
      inputSchema: getActivityDetailsInputSchema,
      outputSchema: getActivityDetailsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    toolHandler(async ({ activityId }) => ({ activity: await client.getActivity(activityId) })),
  );
}
