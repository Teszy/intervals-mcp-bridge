import { z } from 'zod';

/** Inclusive athlete-local dates; UTC arithmetic counts calendar days only. */
export const trainingDateRangeSchema = z
  .strictObject({
    oldest: z.iso.date().describe('First athlete-local calendar date, YYYY-MM-DD, inclusive'),
    newest: z.iso.date().describe('Last athlete-local calendar date, YYYY-MM-DD, inclusive'),
  })
  .refine(({ oldest, newest }) => newest >= oldest, {
    message: 'newest must not precede oldest.',
    path: ['newest'],
  })
  .refine(({ oldest, newest }) => Date.parse(newest) - Date.parse(oldest) < 90 * 86_400_000, {
    message: 'Request at most 90 inclusive calendar days at a time.',
    path: ['newest'],
  });

export type TrainingDateRange = z.infer<typeof trainingDateRangeSchema>;
