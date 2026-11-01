import { z } from 'zod';

export const plannedWorkoutEventSchema = z.object({
  id: z.number().int().positive(),
  category: z.literal('WORKOUT'),
  start_date_local: z.string().min(1),
  name: z.string().nullish(),
  type: z.string().nullish(),
  external_id: z.string().nullish(),
});
export type PlannedWorkoutEvent = z.infer<typeof plannedWorkoutEventSchema>;
