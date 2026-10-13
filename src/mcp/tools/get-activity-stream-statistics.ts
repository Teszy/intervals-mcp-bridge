import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { IntervalsClient } from '../../intervals/client.js';
import {
  activityIdSchema,
  activityStreamTypeSchema,
  activityStreamTypesSchema,
  defaultActivityStreamTypes,
} from '../../intervals/schemas.js';
import { calculateActivityStreamStatistics } from '../../intervals/activity-stream-statistics.js';
import { toolResult } from '../result.js';

const zoneSchema = z.object({
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

const inputSchema = z
  .object({
    activityId: activityIdSchema,
    types: activityStreamTypesSchema.default(defaultActivityStreamTypes),
    startTime: z.number().nonnegative().optional(),
    endTime: z.number().nonnegative().optional(),
    maxGapSeconds: z.number().positive().max(300).default(30),
    zones: z.array(zoneSchema).max(6).default([]),
  })
  .refine(
    ({ startTime, endTime }) => endTime === undefined || endTime >= (startTime ?? 0),
    'endTime must not precede startTime.',
  )
  .refine(
    ({ types, zones }) =>
      new Set(zones.map((zone) => zone.type)).size === zones.length &&
      zones.every((zone) => types.includes(zone.type)),
    'Zones must refer to selected streams without duplicate definitions.',
  );

const outputSchema = z.object({
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

export function registerGetActivityStreamStatisticsTool(
  server: McpServer,
  client: IntervalsClient,
): void {
  server.registerTool(
    'get_activity_stream_statistics',
    {
      title: 'Activity stream statistics',
      description:
        'Calculate duration-weighted means, observed minima/maxima and data coverage from full-resolution streams, never sampled points. Optional elapsed startTime/endTime clips the window. Each value applies until the next timestamp; gaps greater than maxGapSeconds (default 30) are excluded, and the final value has no duration. Nulls are excluded from means; missingSeconds and gapSeconds report unknown time. Optional zones use strictly increasing boundaries in the stream units: values equal to a boundary enter the higher zone. Use athlete-specific boundaries supplied by the user; do not invent zones. Results include stopped time and may differ from Intervals moving-time metrics. For distance, weightedMean describes cumulative distance, not speed or distance travelled.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ activityId, types, startTime, endTime, maxGapSeconds, zones }) =>
      toolResult(
        async () => ({
          activityId,
          ...calculateActivityStreamStatistics(await client.getActivityStreams(activityId, types), {
            startTime,
            endTime,
            maxGapSeconds,
            zones,
          }),
        }),
        'Unable to calculate valid stream statistics. The data may be unavailable through the Intervals API.',
      ),
  );
}
