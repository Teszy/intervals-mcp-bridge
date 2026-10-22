import { z } from 'zod';

/** IDs are opaque; allow path-safe identifiers without assuming an i-prefix. */
export const activityIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const activitySummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  type: z.string().nullish(),
  start_date_local: z.string().nullish(),
  distance: z.number().nonnegative().nullish().describe('Meters'),
  moving_time: z.number().nonnegative().nullish().describe('Seconds'),
});

const intervalSchema = z.object({
  id: z.number().int(),
  type: z.enum(['WORK', 'RECOVERY']).nullish(),
  label: z.string().nullish(),
  start_time: z.number().nonnegative().nullish().describe('Seconds from activity start'),
  end_time: z.number().nonnegative().nullish().describe('Seconds from activity start'),
  distance: z.number().nonnegative().nullish().describe('Meters'),
  moving_time: z.number().nonnegative().nullish().describe('Seconds'),
  average_speed: z.number().nonnegative().nullish().describe('Meters per second'),
  average_heartrate: z.number().nonnegative().nullish().describe('Beats per minute'),
  average_watts: z.number().nonnegative().nullish().describe('Watts'),
  average_cadence: z.number().nonnegative().nullish(),
});

export const activityDetailsSchema = activitySummarySchema.extend({
  // Hidden activity stubs omit this field; do not present them as session details.
  moving_time: z.number().nonnegative().nullable().describe('Seconds'),
  start_date: z.string().nullish().describe('UTC start time'),
  source: z.string().nullish(),
  elapsed_time: z.number().nonnegative().nullish().describe('Seconds'),
  total_elevation_gain: z.number().nonnegative().nullish().describe('Meters'),
  average_speed: z.number().nonnegative().nullish().describe('Meters per second'),
  max_speed: z.number().nonnegative().nullish().describe('Meters per second'),
  average_heartrate: z.number().nonnegative().nullish().describe('Beats per minute'),
  max_heartrate: z.number().nonnegative().nullish().describe('Beats per minute'),
  average_cadence: z.number().nonnegative().nullish(),
  icu_average_watts: z.number().nonnegative().nullish().describe('Watts'),
  icu_weighted_avg_watts: z.number().nonnegative().nullish().describe('Watts'),
  icu_ftp: z.number().nonnegative().nullish().describe('Watts'),
  icu_training_load: z.number().nonnegative().nullish(),
  icu_intensity: z.number().nonnegative().nullish().describe('Percent of threshold'),
  icu_rpe: z.number().nullish(),
  feel: z.number().nullish(),
  stream_types: z.array(z.string()).nullish(),
  icu_intervals: z.array(intervalSchema).nullish(),
});

export type ActivitySummary = z.infer<typeof activitySummarySchema>;
export type ActivityDetails = z.infer<typeof activityDetailsSchema>;

export const activityWorkloadSchema = activitySummarySchema.extend({
  icu_training_load: z
    .number()
    .nonnegative()
    .nullish()
    .describe('Intervals training load; not necessarily power-based TSS'),
  icu_intensity: z.number().nonnegative().nullish().describe('Percent of threshold'),
  power_load: z.number().nonnegative().nullish(),
  hr_load: z.number().nonnegative().nullish(),
  pace_load: z.number().nonnegative().nullish(),
  icu_rpe: z.number().nullish().describe('Recorded perceived exertion'),
  feel: z.number().nullish().describe('Recorded session feel'),
});
export type ActivityWorkload = z.infer<typeof activityWorkloadSchema>;

/** Number of recent UTC calendar dates to include, counting today. */
export const recentActivityDaysSchema = z.number().int().min(1).max(365).default(7);
