import { z } from 'zod';

/** IDs are opaque; allow path-safe identifiers without assuming an i-prefix. */
export const activityIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const activitySchema = z.object({
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

export const activityDetailsSchema = activitySchema.extend({
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

export type ActivitySummary = z.infer<typeof activitySchema>;
export type ActivityDetails = z.infer<typeof activityDetailsSchema>;

export const activityStreamTypeSchema = z.enum([
  'heartrate',
  'velocity_smooth',
  'watts',
  'cadence',
  'distance',
  'altitude',
]);

export const activityStreamTypesSchema = z.array(activityStreamTypeSchema).min(1).max(6);
export const defaultActivityStreamTypes: ActivityStreamType[] = [
  'heartrate',
  'velocity_smooth',
  'watts',
  'cadence',
];

export const activityStreamSchema = z.object({
  type: activityStreamTypeSchema,
  data: z.array(z.number().nullable()),
});

/** Upstream streams also include time; unrequested scalar streams are discarded. */
export const activityStreamsResponseSchema = z.array(
  z.object({ type: z.string(), data: z.array(z.number().nullable()) }),
);

export type ActivityStreamType = z.infer<typeof activityStreamTypeSchema>;
export const activityStreamUnits: Record<ActivityStreamType, string> = {
  heartrate: 'beats per minute',
  velocity_smooth: 'meters per second',
  watts: 'watts (Intervals corrected power)',
  cadence: 'recorded cadence; units depend on sport and source',
  distance: 'meters (cumulative)',
  altitude: 'meters',
};

export type ActivityStreams = {
  time: number[];
  streams: z.infer<typeof activityStreamSchema>[];
  missingStreams: ActivityStreamType[];
};

const zoneLimits = z
  .array(z.number().nonnegative())
  .refine(
    (values) => values.every((value, index) => index === 0 || value > values[index - 1]!),
    'Zone limits must be strictly increasing.',
  );

/** Curated fields from the official Athlete / SportSettings API models. */
export const sportSettingsSchema = z.object({
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
  hr_zones: zoneLimits
    .nullish()
    .describe('Upper heart-rate limits in bpm, including the final zone'),
  hr_zone_names: z.array(z.string()).nullish(),
  power_zones: zoneLimits
    .nullish()
    .describe('Upper zone limits as percentages of FTP, including the final zone'),
  power_zone_names: z.array(z.string()).nullish(),
  pace_zones: zoneLimits
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
});

export type AthleteSettings = z.infer<typeof athleteSettingsSchema>;

/** Inclusive athlete-local dates; UTC arithmetic counts calendar days only. */
export const trainingDateRangeSchema = z
  .object({
    oldest: z.iso.date().describe('First athlete-local calendar date, YYYY-MM-DD, inclusive'),
    newest: z.iso.date().describe('Last athlete-local calendar date, YYYY-MM-DD, inclusive'),
  })
  .refine(({ oldest, newest }) => newest >= oldest, {
    message: 'newest must not precede oldest.',
    path: ['newest'],
  })
  .refine(({ oldest, newest }) => Date.parse(newest) - Date.parse(oldest) < 90 * 86_400_000, {
    message: 'Request at most 90 inclusive calendar days at a time.',
    path: ['newest'],
  });

export type TrainingDateRange = z.infer<typeof trainingDateRangeSchema>;

export const activityWorkloadSchema = activitySchema.extend({
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

/** Curated daily wellness and fitness fields; unselected personal fields are stripped. */
export const wellnessSchema = z.object({
  id: z.iso.date().describe('Athlete-local calendar date'),
  ctl: z.number().nonnegative().nullish().describe('Intervals chronic training load (fitness)'),
  atl: z
    .number()
    .nonnegative()
    .nullish()
    .describe('Intervals acute training load (fatigue model, not subjective fatigue)'),
  rampRate: z.number().nullish().describe('Intervals fitness ramp rate'),
  ctlLoad: z.number().nonnegative().nullish(),
  atlLoad: z.number().nonnegative().nullish(),
  weight: z.number().nonnegative().nullish().describe('Kilograms'),
  restingHR: z.number().nonnegative().nullish().describe('Beats per minute'),
  hrv: z.number().nonnegative().nullish().describe('rMSSD in milliseconds'),
  hrvSDNN: z.number().nonnegative().nullish().describe('SDNN in milliseconds; distinct from rMSSD'),
  sleepSecs: z.number().nonnegative().nullish().describe('Seconds'),
  sleepScore: z.number().nullish().describe('Source-provided sleep score; scale depends on source'),
  sleepQuality: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullish()
    .describe('1 excellent, 2 good, 3 average, 4 poor'),
  soreness: z
    .number()
    .int()
    .min(0)
    .max(4)
    .nullish()
    .describe('0 none, 1 low, 2 average, 3 high, 4 extreme'),
  fatigue: z
    .number()
    .int()
    .min(0)
    .max(4)
    .nullish()
    .describe('Subjective: 0 none, 1 low, 2 average, 3 high, 4 extreme'),
  stress: z
    .number()
    .int()
    .min(0)
    .max(4)
    .nullish()
    .describe('0 none, 1 low, 2 average, 3 high, 4 extreme'),
  mood: z.number().int().min(1).max(4).nullish().describe('1 excellent, 2 good, 3 average, 4 poor'),
  motivation: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullish()
    .describe('1 excellent, 2 good, 3 average, 4 poor'),
  injury: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullish()
    .describe('1 excellent, 2 niggle, 3 poor, 4 injured'),
  tempWeight: z
    .boolean()
    .nullish()
    .describe('True: weight came from settings, not an authoritative daily observation'),
  tempRestingHR: z
    .boolean()
    .nullish()
    .describe('True: resting HR came from settings, not an authoritative daily observation'),
});
export type Wellness = z.infer<typeof wellnessSchema>;
