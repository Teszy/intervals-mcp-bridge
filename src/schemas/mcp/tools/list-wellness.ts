import { z } from 'zod';
import { wellnessSchema } from '../../wellness.js';
import { trainingDateRangeSchema } from '../../date-range.js';

export const listWellnessInputSchema = trainingDateRangeSchema;

export const listWellnessOutputSchema = z.object({
  oldest: z.iso.date(),
  newest: z.iso.date(),
  wellness: z.array(wellnessSchema),
});
