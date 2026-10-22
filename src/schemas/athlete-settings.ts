import { z } from 'zod';

const zoneLimitsSchema = z.array(z.number());

/** Curated fields from the official Athlete / SportSettings API models. */
const sportSettingsSchema = z.object({
  id: z.number().int(),
  types: z.array(z.string().min(1)),
  ftp: z.number().nonnegative().nullish().describe('Watts; outdoor FTP'),
  indoor_ftp: z.number().nonnegative().nullish().describe('Watts; indoor FTP'),
  lthr: z.number().nonnegative().nullish().describe('Threshold heart rate in bpm'),
  max_hr: z.number().nonnegative().nullish().describe('Maximum heart rate in bpm'),
  threshold_pace: z
    .number()
    .nonnegative()
    .nullish()
    .describe('Threshold speed in meters/second; pace_units controls display'),
  pace_units: z.string().nullish(),
  hr_zones: zoneLimitsSchema
    .nullish()
    .describe('Upper heart-rate limits in bpm, including the final zone'),
  hr_zone_names: z.array(z.string()).nullish(),
  power_zones: zoneLimitsSchema
    .nullish()
    .describe('Upper zone limits as percentages of FTP, including the final zone'),
  power_zone_names: z.array(z.string()).nullish(),
  pace_zones: zoneLimitsSchema
    .nullish()
    .describe('Upper zone limits as percentages of threshold speed, including the final zone'),
  pace_zone_names: z.array(z.string()).nullish(),
  load_order: z.string().nullish(),
  tiz_order: z.string().nullish(),
  workout_order: z.string().nullish(),
});

export const athleteSettingsSchema = z.object({
  id: z.string().min(1),
  timezone: z.string().nullish(),
  measurement_preference: z.string().nullish(),
  icu_resting_hr: z.number().nonnegative().nullish().describe('Beats per minute'),
  icu_weight: z
    .number()
    .nonnegative()
    .nullish()
    .describe('Kilograms; configured weight, not daily wellness'),
  sportSettings: z.array(sportSettingsSchema),
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

/** Curated upstream fields; application warnings are added after parsing. */
export const athleteSettingsResponseSchema = athleteSettingsSchema.omit({ zoneWarnings: true });
export type AthleteSettingsResponse = z.infer<typeof athleteSettingsResponseSchema>;
