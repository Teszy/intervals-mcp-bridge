import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import packageInfo from '../../package.json' with { type: 'json' };
import { HTTPError } from '../api/errors.js';
import { activitySchema, IntervalsClient } from '../intervals/client.js';
import type { IntervalsConfig } from '../intervals/config.js';

/** Build the tool registry without opening a transport or making API requests. */
export function createServer(config: IntervalsConfig): McpServer {
  const client = new IntervalsClient(config);
  const server = new McpServer({ name: packageInfo.name, version: packageInfo.version });

  server.registerTool(
    'get_recent_activities',
    {
      title: 'Recent activities',
      description:
        'Fetch recent Intervals.icu activities for the configured athlete. Includes today; date bounds use UTC. Distance is in meters and moving_time in seconds.',
      inputSchema: z.object({ days: z.number().int().min(1).max(365).default(7) }),
      outputSchema: z.object({ activities: z.array(activitySchema) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async ({ days }) => {
      try {
        const output = { activities: await client.getRecentActivities(days) };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error: unknown) {
        // HTTPError is sanitized by APIClient. Do not expose arbitrary exception details.
        const message =
          error instanceof HTTPError
            ? error.message
            : 'Unable to retrieve valid Intervals activities.';
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    },
  );

  return server;
}
