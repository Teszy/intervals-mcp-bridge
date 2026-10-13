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
    pageSize: z.number().int().min(1).max(500).default(200),
    offset: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .default(0)
      .describe('Point offset within the filtered time window'),
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
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  hasMore: z.boolean(),
});

export function registerGetActivityStreamPageTool(
  server: McpServer,
  client: IntervalsClient,
): void {
  server.registerTool(
    'get_activity_stream_page',
    {
      title: 'Activity stream page',
      description:
        'Retrieve consecutive original measurements without sampling for detailed inspection or lossless traversal. Returns 200 points per page by default (maximum 500). Optional startTime/endTime bounds are inclusive elapsed seconds. Start at offset=0; continue with nextOffset until it is null, keeping activityId, types and time bounds unchanged. Offsets count points in the filtered window, not seconds. Time and stream arrays share indices; null means missing, not zero. Each call fetches current upstream data, so activity changes during traversal can shift pages. Use get_activity_stream_overview for a compact sampled overview and get_activity_stream_statistics for statistics from full-resolution data. Speeds are meters/second.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    ({ activityId, types, pageSize, offset, startTime, endTime }) =>
      toolResult(async () => {
        const data = await client.getActivityStreams(activityId, types);
        const indices = data.time.flatMap((time, index) =>
          time >= (startTime ?? 0) && (endTime === undefined || time <= endTime) ? [index] : [],
        );
        const selected = indices.slice(offset, offset + pageSize);
        const hasMore = offset + selected.length < indices.length;
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
          offset,
          nextOffset: hasMore ? offset + selected.length : null,
          hasMore,
        };
      }, 'Unable to retrieve valid activity streams. The data may be unavailable through the Intervals API.'),
  );
}
