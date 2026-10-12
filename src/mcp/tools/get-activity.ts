import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { IntervalsClient } from '../../intervals/client.js';
import { activityDetailsSchema, activityIdSchema } from '../../intervals/schemas.js';
import { toolResult } from '../result.js';

const inputSchema = z.object({ activityId: activityIdSchema });
const outputSchema = z.object({ activity: activityDetailsSchema });

export function registerGetActivityTool(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    'get_activity',
    {
      title: 'Activity details',
      description:
        'Fetch session metrics and detected work/recovery intervals for an activity. Use an ID from get_recent_activities. Missing or null measurements are unavailable, not zero. Speeds are meters per second; cadence units depend on sport and recording source. Full time-series streams are not included.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ activityId }) =>
      toolResult(
        async () => ({ activity: await client.getActivity(activityId) }),
        'Unable to retrieve valid activity details. The activity may be unavailable through the Intervals API.',
      ),
  );
}
