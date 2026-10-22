import { z } from 'zod';
import { activityIdSchema } from '../activities.js';
import { activityStreamTypesSchema, defaultActivityStreamTypes } from '../streams.js';

/** Shared stream selection and inclusive elapsed-time bounds for stream tools. */
export const activityStreamQuerySchema = z
  .strictObject({
    activityId: activityIdSchema,
    types: activityStreamTypesSchema.default(defaultActivityStreamTypes),
    startTime: z.number().nonnegative().optional().describe('Inclusive elapsed seconds'),
    endTime: z.number().nonnegative().optional().describe('Inclusive elapsed seconds'),
  })
  .refine(({ startTime, endTime }) => endTime === undefined || endTime >= (startTime ?? 0), {
    message: 'endTime must not precede startTime.',
    path: ['endTime'],
  });
