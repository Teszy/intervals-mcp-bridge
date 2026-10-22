import { z } from 'zod';
import { activityWorkloadSchema } from '../../activities.js';
import { trainingDateRangeSchema } from '../../date-range.js';

export const listActivityWorkloadInputSchema = trainingDateRangeSchema;

export const listActivityWorkloadOutputSchema = z.object({
  oldest: z.iso.date(),
  newest: z.iso.date(),
  activities: z.array(activityWorkloadSchema),
});
