import { z } from 'zod';

import { athleteSettingsResponseSchema } from '../../intervals/schemas/athlete-settings.js';

/** Validated Intervals settings enriched with advisory bridge warnings. */
export const athleteSettingsSchema = athleteSettingsResponseSchema.extend({
  zoneWarnings: z
    .array(
      z.object({
        sportSettingsId: z.number().int(),
        types: z.array(z.string()),
        field: z.enum(['hr_zones', 'power_zones', 'pace_zones']),
        code: z.literal('INVALID_ZONE_LIMITS'),
      }),
    )
    .optional()
    .describe(
      'Non-increasing upstream zone arrays are returned unchanged; warnings identify the affected profile and field',
    ),
});

export type AthleteSettings = z.infer<typeof athleteSettingsSchema>;
