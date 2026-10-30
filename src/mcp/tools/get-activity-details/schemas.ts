import { z } from 'zod';

import { activityDetailsSchema, activityIdSchema } from '../../../intervals/schemas/activities.js';

export const getActivityDetailsInputSchema = z.strictObject({ activityId: activityIdSchema });

export const getActivityDetailsOutputSchema = z.object({ activity: activityDetailsSchema });
