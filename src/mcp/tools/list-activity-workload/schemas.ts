import { z } from 'zod';
import { activityWorkloadSchema } from '../../../intervals/schemas/activities.js';
import { trainingDateRangeSchema } from '../../../shared/schemas/date-range.js';

export const listActivityWorkloadInputSchema = trainingDateRangeSchema;

export const listActivityWorkloadOutputSchema = z.object({
  oldest: z.iso.date(),
  newest: z.iso.date(),
  activities: z.array(activityWorkloadSchema),
});
