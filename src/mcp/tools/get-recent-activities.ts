import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { IntervalsClient } from '../../intervals/client.js';
import { activitySchema } from '../../intervals/schemas.js';
import { toolResult } from '../result.js';

const inputSchema = z.object({ days: z.number().int().min(1).max(365).default(7) });
const outputSchema = z.object({ activities: z.array(activitySchema) });

export function registerGetRecentActivitiesTool(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    'get_recent_activities',
    {
      title: 'Recent activities',
      description:
        'Fetch recent Intervals.icu activities for the configured athlete. Includes today; date bounds use UTC. Distance is in meters and moving_time in seconds.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ days }) =>
      toolResult(
        async () => ({ activities: await client.getRecentActivities(days) }),
        'Unable to retrieve valid Intervals activities.',
      ),
  );
}
