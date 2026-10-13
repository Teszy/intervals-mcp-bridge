import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { IntervalsClient } from '../../intervals/client.js';
import { wellnessSchema, trainingDateRangeSchema } from '../../intervals/schemas.js';
import { toolResult } from '../result.js';

export function registerListWellnessTool(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    'list_wellness',
    {
      title: 'Daily wellness and fitness',
      description:
        'List daily wellness and Intervals CTL/ATL fitness values in an inclusive athlete-local date range (oldest/newest YYYY-MM-DD, maximum 90 days), ordered oldest first. Use get_athlete_settings for the athlete timezone when resolving relative dates. Includes sleep, resting HR, HRV, weight and subjective recovery ratings where recorded. Missing dates and missing/null fields remain unknown; never fill them with zero or infer rest days. CTL and ATL are upstream training-load model values, not direct physiological measurements; subjective fatigue is a separate field. HRV rMSSD and SDNN are different metrics and must not be combined. sleepScore scales depend on source; subjective rating meanings are in the field descriptions. tempWeight/tempRestingHR indicate settings-derived values, not authoritative daily observations. Use list_activity_workload over the same dates to compare sessions with recovery trends. Today may be incomplete. This tool retrieves observations and model values; it does not determine medical status or readiness for a specific workout.',
      inputSchema: trainingDateRangeSchema,
      outputSchema: z.object({
        oldest: z.iso.date(),
        newest: z.iso.date(),
        wellness: z.array(wellnessSchema),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ oldest, newest }) =>
      toolResult(
        async () => ({ oldest, newest, wellness: await client.getWellness({ oldest, newest }) }),
        'Unable to retrieve valid wellness records. The data may be unavailable through the Intervals API.',
      ),
  );
}
