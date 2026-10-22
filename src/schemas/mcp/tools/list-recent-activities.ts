import { z } from 'zod';
import { activitySummarySchema, recentActivityDaysSchema } from '../../activities.js';

export const listRecentActivitiesInputSchema = z.strictObject({ days: recentActivityDaysSchema });

export const listRecentActivitiesOutputSchema = z.object({
  activities: z.array(activitySummarySchema),
});
