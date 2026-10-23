import {
  getAthleteSettingsInputSchema,
  getAthleteSettingsOutputSchema,
} from '../../schemas/mcp/tools/get-athlete-settings.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import { toolResult } from '../result.js';

export function registerGetAthleteSettingsTool(server: McpServer, client: IntervalsApi): void {
  server.registerTool(
    'get_athlete_settings',
    {
      title: 'Athlete settings and training zones',
      description:
        'Retrieve current training settings and all sport profiles for the configured athlete. Match the activity type to a profile types array; do not assume cycling zones apply to running. Includes outdoor/indoor FTP in watts, threshold/max heart rate in bpm, threshold_pace as speed in meters/second and original zone limits/names. hr_zones contains upper limits in bpm; power_zones and pace_zones contain upper limits as percentages of FTP and threshold speed respectively, including the final zone. These arrays are not the lower-inclusive absolute boundaries accepted by get_activity_stream_statistics: do not pass them through directly. Missing or null settings are unavailable, not zero. Zone arrays are returned exactly as recorded. settings.zoneWarnings flags non-increasing limits without changing or rejecting them; report the warning and ask the user to confirm suitable boundaries before using those zones. Other settings remain usable. These are current settings, not historical settings for an older activity; prefer recorded activity thresholds when analyzing past sessions. pace_units and measurement_preference are display preferences, not API speed units. Use these settings for personal context; never invent missing thresholds or zones.',
      inputSchema: getAthleteSettingsInputSchema,
      outputSchema: getAthleteSettingsOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    () => toolResult(async () => ({ settings: await client.getAthleteSettings() })),
  );
}
