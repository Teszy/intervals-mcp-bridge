import { activityStreamQuerySchema } from './activity-stream-query.schemas.js';
import { z } from 'zod';
import { activityIdSchema } from '../../schemas/activities.js';
import { activityStreamSchema, activityStreamTypeSchema } from '../../schemas/streams.js';

export const getActivityStreamPageInputSchema = activityStreamQuerySchema.safeExtend({
  pageSize: z.number().int().min(1).max(500).default(200),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .default(0)
    .describe('Point offset within the filtered time window'),
});

export const getActivityStreamPageOutputSchema = z.object({
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
