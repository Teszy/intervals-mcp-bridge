import { z } from 'zod';

/** Curated daily wellness and fitness fields; unselected personal fields are stripped. */
export const wellnessSchema = z.object({
  id: z.iso.date().describe('Athlete-local calendar date'),
  ctl: z.number().nonnegative().nullish().describe('Intervals chronic training load (fitness)'),
  atl: z
    .number()
    .nonnegative()
    .nullish()
    .describe('Intervals acute training load (fatigue model, not subjective fatigue)'),
  rampRate: z.number().nullish().describe('Intervals fitness ramp rate'),
  ctlLoad: z.number().nonnegative().nullish(),
  atlLoad: z.number().nonnegative().nullish(),
  weight: z.number().nonnegative().nullish().describe('Kilograms'),
  restingHR: z.number().nonnegative().nullish().describe('Beats per minute'),
  hrv: z.number().nonnegative().nullish().describe('rMSSD in milliseconds'),
  hrvSDNN: z.number().nonnegative().nullish().describe('SDNN in milliseconds; distinct from rMSSD'),
  sleepSecs: z.number().nonnegative().nullish().describe('Seconds'),
  sleepScore: z.number().nullish().describe('Source-provided sleep score; scale depends on source'),
  sleepQuality: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullish()
    .describe('1 excellent, 2 good, 3 average, 4 poor'),
  soreness: z
    .number()
    .int()
    .min(0)
    .max(4)
    .nullish()
    .describe('0 none, 1 low, 2 average, 3 high, 4 extreme'),
  fatigue: z
    .number()
    .int()
    .min(0)
    .max(4)
    .nullish()
    .describe('Subjective: 0 none, 1 low, 2 average, 3 high, 4 extreme'),
  stress: z
    .number()
    .int()
    .min(0)
    .max(4)
    .nullish()
    .describe('0 none, 1 low, 2 average, 3 high, 4 extreme'),
  mood: z.number().int().min(1).max(4).nullish().describe('1 excellent, 2 good, 3 average, 4 poor'),
  motivation: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullish()
    .describe('1 excellent, 2 good, 3 average, 4 poor'),
  injury: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullish()
    .describe('1 excellent, 2 niggle, 3 poor, 4 injured'),
  tempWeight: z
    .boolean()
    .nullish()
    .describe('True: weight came from settings, not an authoritative daily observation'),
  tempRestingHR: z
    .boolean()
    .nullish()
    .describe('True: resting HR came from settings, not an authoritative daily observation'),
});
export type Wellness = z.infer<typeof wellnessSchema>;
