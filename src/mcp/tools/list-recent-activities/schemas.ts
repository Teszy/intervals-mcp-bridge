import { z } from 'zod';

import { activitySummarySchema } from '#intervals/schemas/activities.js';
import { athleteDateRangeSchema } from '#shared/schemas/date-range.js';

export const listRecentActivitiesInputSchema = athleteDateRangeSchema.refine(
  ({ oldest, newest }) => Date.parse(newest) - Date.parse(oldest) < 365 * 86_400_000,
  {
    message: 'Request at most 365 inclusive calendar days at a time.',
    path: ['newest'],
  },
);

export const listRecentActivitiesOutputSchema = z.object({
  oldest: z.iso.date(),
  newest: z.iso.date(),
  activities: z.array(activitySummarySchema),
});
