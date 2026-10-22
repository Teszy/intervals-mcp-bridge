import { z } from 'zod';
import { activityDetailsSchema, activityIdSchema } from '../../activities.js';

export const getActivityDetailsInputSchema = z.strictObject({ activityId: activityIdSchema });

export const getActivityDetailsOutputSchema = z.object({ activity: activityDetailsSchema });
