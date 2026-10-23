import {
  listActivityWorkloadInputSchema,
  listActivityWorkloadOutputSchema,
} from '../../schemas/mcp/tools/list-activity-workload.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { toolResult } from '../result.js';

export function registerListActivityWorkloadTool(server: McpServer, client: IntervalsApi): void {
  server.registerTool(
    'list_activity_workload',
    {
      title: 'Activity workload',
      description:
        'List completed activities and recorded training load in an inclusive athlete-local date range (oldest/newest YYYY-MM-DD, maximum 90 days). Use get_athlete_settings for the athlete timezone when resolving relative dates. Returns session load, intensity as percent of threshold, power/HR/pace load estimates, duration in seconds and distance in meters where available. icu_training_load is the selected Intervals load; power_load, hr_load and pace_load are alternative estimates, not components to add together. Missing/null load is unknown, not zero; restricted activities can contain only an ID. Do not report a complete period total if load is missing or activities are inaccessible. Use list_wellness for daily CTL/ATL and recovery context, and get_activity_details for a selected session. No fitness model or training recommendation is calculated by this tool.',
      inputSchema: listActivityWorkloadInputSchema,
      outputSchema: listActivityWorkloadOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ oldest, newest }) =>
      toolResult(async () => ({
        oldest,
        newest,
        activities: await client.getActivityWorkload({ oldest, newest }),
      })),
  );
}
