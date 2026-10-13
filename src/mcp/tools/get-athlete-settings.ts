import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { IntervalsClient } from '../../intervals/client.js';
import { athleteSettingsSchema } from '../../intervals/schemas.js';
import { toolResult } from '../result.js';

export function registerGetAthleteSettingsTool(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    'get_athlete_settings',
    {
      title: 'Athlete settings and training zones',
      description:
        'Retrieve current training settings and all sport profiles for the configured athlete. Match the activity type to a profile types array; do not assume cycling zones apply to running. Includes outdoor/indoor FTP in watts, threshold/max heart rate in bpm, threshold_pace as speed in meters/second and original zone limits/names. hr_zones contains upper limits in bpm; power_zones and pace_zones contain upper limits as percentages of FTP and threshold speed respectively, including the final zone. These arrays are not the lower-inclusive absolute boundaries accepted by get_activity_stream_statistics: do not pass them through directly. Missing or null settings are unavailable, not zero. These are current settings, not historical settings for an older activity; prefer recorded activity thresholds when analyzing past sessions. pace_units and measurement_preference are display preferences, not API speed units. Use these settings for personal context; never invent missing thresholds or zones.',
      inputSchema: z.object({}),
      outputSchema: z.object({ settings: athleteSettingsSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    () =>
      toolResult(
        async () => ({ settings: await client.getAthleteSettings() }),
        'Unable to retrieve valid athlete settings. The settings may be unavailable through the Intervals API.',
      ),
  );
}
