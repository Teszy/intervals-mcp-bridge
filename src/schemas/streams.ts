import { z } from 'zod';

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
export type ActivityStream = z.infer<typeof activityStreamSchema>;

/** Upstream streams also include time; unrequested scalar streams are discarded. */
export const activityStreamsResponseSchema = z.array(
  activityStreamSchema.extend({ type: z.string() }),
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
  streams: ActivityStream[];
  missingStreams: ActivityStreamType[];
};
