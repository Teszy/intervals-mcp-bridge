import { activityStreamQuerySchema } from '../activity-stream-query.js';
import { z } from 'zod';
import { activityIdSchema } from '../../activities.js';
import { activityStreamTypeSchema } from '../../streams.js';

const zoneSchema = z.strictObject({
  type: activityStreamTypeSchema,
  boundaries: z
    .array(z.number())
    .min(1)
    .max(10)
    .refine(
      (values) => values.every((value, index) => index === 0 || value > values[index - 1]!),
      'Zone boundaries must be strictly increasing.',
    ),
});

export const getActivityStreamStatisticsInputSchema = activityStreamQuerySchema
  .safeExtend({
    maxGapSeconds: z.number().positive().max(300).default(30),
    zones: z.array(zoneSchema).max(6).default([]),
  })
  .refine(
    ({ types, zones }) =>
      new Set(zones.map((zone) => zone.type)).size === zones.length &&
      zones.every((zone) => types.includes(zone.type)),
    'Zones must refer to selected streams without duplicate definitions.',
  );

export const getActivityStreamStatisticsOutputSchema = z.object({
  activityId: activityIdSchema,
  startTime: z.number().nonnegative().nullable(),
  endTime: z.number().nonnegative().nullable(),
  durationSeconds: z.number().nonnegative(),
  totalPoints: z.number().int().nonnegative(),
  maxGapSeconds: z.number().positive(),
  method: z.string(),
  missingStreams: z.array(activityStreamTypeSchema),
  summaries: z.array(
    z.object({
      type: activityStreamTypeSchema,
      unit: z.string(),
      validSamples: z.number().int().nonnegative(),
      min: z.number().nullable(),
      max: z.number().nullable(),
      weightedMean: z.number().nullable(),
      validSeconds: z.number().nonnegative(),
      missingSeconds: z.number().nonnegative(),
      gapSeconds: z.number().nonnegative(),
      coveragePercent: z.number().min(0).max(100).nullable(),
      zones: z
        .object({ boundaries: z.array(z.number()), seconds: z.array(z.number().nonnegative()) })
        .optional(),
    }),
  ),
});
