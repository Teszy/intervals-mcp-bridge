import { z } from 'zod';

const configSchema = z.object({
  apiKey: z.string().trim().min(1),
  athleteId: z
    .string()
    .trim()
    .regex(/^(?:0|i?[1-9]\d*)$/),
});

export type IntervalsConfig = z.infer<typeof configSchema>;

export function validateIntervalsConfig(config: IntervalsConfig): IntervalsConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    throw new Error('Invalid Intervals configuration: provide an API key and a valid athlete ID.');
  }
  return result.data;
}

export function loadIntervalsConfig(env: NodeJS.ProcessEnv = process.env): IntervalsConfig {
  return validateIntervalsConfig({
    apiKey: env.INTERVALS_API_KEY ?? '',
    athleteId: env.INTERVALS_ATHLETE_ID ?? '0',
  });
}
