import { z } from 'zod';

const configSchema = z.object({
  apiKey: z.string().trim().min(1),
  athleteId: z
    .string()
    .trim()
    .regex(/^(?:0|i?[1-9]\d*)$/),
  baseURL: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/ }))
    .transform((url) => url.replace(/\/+$/, '')),
});

export type IntervalsConfig = z.infer<typeof configSchema>;

/** Load and validate environment configuration. */
export function loadIntervalsConfig(env: NodeJS.ProcessEnv = process.env): IntervalsConfig {
  const result = configSchema.safeParse({
    apiKey: env.INTERVALS_API_KEY ?? '',
    athleteId: env.INTERVALS_ATHLETE_ID ?? '0',
    baseURL: env.INTERVALS_BASE_URL,
  });
  if (!result.success) {
    throw new Error(
      'Invalid Intervals configuration: provide an API key, a valid athlete ID, and an HTTP or HTTPS INTERVALS_BASE_URL.',
    );
  }
  return result.data;
}
