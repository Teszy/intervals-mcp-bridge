import { z } from 'zod';
import { plannedWorkoutSchema, workoutDraftStatusSchema } from '../../workouts.js';

export const previewPlannedWorkoutInputSchema = z.strictObject({ workout: plannedWorkoutSchema });

export const previewPlannedWorkoutOutputSchema = z.object({
  draftId: z.uuid(),
  status: workoutDraftStatusSchema,
  workout: plannedWorkoutSchema,
  timedSeconds: z.number().nonnegative(),
  distanceMeters: z.number().nonnegative(),
  totalDurationKnown: z.boolean(),
  fit: z.object({
    filename: z.string(),
    bytes: z.number().int().positive(),
    sha256: z.string(),
  }),
});
