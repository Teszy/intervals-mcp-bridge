import { z } from 'zod';
import { plannedWorkoutEventSchema } from '../../events.js';

export const publishPlannedWorkoutInputSchema = z.strictObject({
  draftId: z.uuid(),
  approved: z.literal(true),
});

export const publishPlannedWorkoutOutputSchema = z.object({
  draftId: z.uuid(),
  event: plannedWorkoutEventSchema,
});
