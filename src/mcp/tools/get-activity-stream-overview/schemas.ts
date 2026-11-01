import { z } from 'zod';

import { activityIdSchema } from '#intervals/schemas/activities.js';
import { activityStreamSchema, activityStreamTypeSchema } from '#intervals/schemas/streams.js';
import { activityStreamQuerySchema } from '#mcp/tools/shared/activity-stream-query.schemas.js';

export const getActivityStreamOverviewInputSchema = activityStreamQuerySchema.safeExtend({
  maxPoints: z.number().int().min(2).max(500).default(200),
});

export const getActivityStreamOverviewOutputSchema = z.object({
  activityId: activityIdSchema,
  time: z.array(z.number().nonnegative()).max(500).describe('Elapsed seconds from activity start'),
  streams: z.array(activityStreamSchema.extend({ unit: z.string() })),
  missingStreams: z.array(activityStreamTypeSchema),
  totalPoints: z.number().int().nonnegative(),
  windowPoints: z.number().int().nonnegative(),
  returnedPoints: z.number().int().nonnegative(),
  sampled: z.boolean(),
});
