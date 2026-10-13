import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { IntervalsClient } from '../../intervals/client.js';
import {
  activityIdSchema,
  activityStreamSchema,
  activityStreamTypeSchema,
  activityStreamTypesSchema,
  defaultActivityStreamTypes,
  activityStreamUnits,
} from '../../intervals/schemas.js';
import { toolResult } from '../result.js';

const inputSchema = z
  .object({
    activityId: activityIdSchema,
    types: activityStreamTypesSchema.default(defaultActivityStreamTypes),
    maxPoints: z.number().int().min(2).max(500).default(200),
    startTime: z.number().nonnegative().optional().describe('Inclusive elapsed seconds'),
    endTime: z.number().nonnegative().optional().describe('Inclusive elapsed seconds'),
  })
  .refine(({ startTime, endTime }) => endTime === undefined || endTime >= (startTime ?? 0), {
    message: 'endTime must not precede startTime.',
    path: ['endTime'],
  });

const outputSchema = z.object({
  activityId: activityIdSchema,
  time: z.array(z.number().nonnegative()).max(500).describe('Elapsed seconds from activity start'),
  streams: z.array(activityStreamSchema.extend({ unit: z.string() })),
  missingStreams: z.array(activityStreamTypeSchema),
  totalPoints: z.number().int().nonnegative(),
  windowPoints: z.number().int().nonnegative(),
  returnedPoints: z.number().int().nonnegative(),
  sampled: z.boolean(),
});

export function registerGetActivityStreamOverviewTool(
  server: McpServer,
  client: IntervalsClient,
): void {
  server.registerTool(
    'get_activity_stream_overview',
    {
      title: 'Activity stream overview',
      description:
        'Fetch selected measurements over elapsed time for an activity ID from list_recent_activities. Time and stream arrays share indices; null values are missing, not zero. Defaults to heart rate, speed, power and cadence, capped at 200 points. If sampled=true, points are evenly selected by sample index, preserving the window endpoints; peaks and short efforts may be missed. Use startTime/endTime to inspect an interval in greater detail. Use get_activity_stream_page for consecutive original points without sampling. Use get_activity_stream_statistics for calculated statistics; do not infer exact averages, peaks or time in zones from sampled data. Speeds are meters/second; running pace in seconds/km is 1000/speed when speed is positive.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ activityId, types, maxPoints, startTime, endTime }) =>
      toolResult(async () => {
        const data = await client.getActivityStreams(activityId, types);
        const indices = data.time.flatMap((time, index) =>
          time >= (startTime ?? 0) && (endTime === undefined || time <= endTime) ? [index] : [],
        );
        const sampled = indices.length > maxPoints;
        const selected = sampled
          ? Array.from(
              { length: maxPoints },
              (_, i) => indices[Math.floor((i * (indices.length - 1)) / (maxPoints - 1))]!,
            )
          : indices;
        return {
          activityId,
          time: selected.map((index) => data.time[index]!),
          streams: data.streams.map((stream) => ({
            type: stream.type,
            unit: activityStreamUnits[stream.type],
            data: selected.map((index) => stream.data[index]!),
          })),
          missingStreams: data.missingStreams,
          totalPoints: data.time.length,
          windowPoints: indices.length,
          returnedPoints: selected.length,
          sampled,
        };
      }, 'Unable to retrieve valid activity streams. The data may be unavailable through the Intervals API.'),
  );
}
