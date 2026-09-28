import { z } from 'zod';
import { validateIntervalsConfig, type IntervalsConfig } from './config.js';

const activitySchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  type: z.string().nullish(),
  start_date_local: z.string().nullish(),
  distance: z.number().nonnegative().nullish(),
  moving_time: z.number().nonnegative().nullish(),
});

export type ActivitySummary = z.infer<typeof activitySchema>;

export class IntervalsApiError extends Error {
  constructor(public readonly status: number) {
    super(`Intervals API request failed (HTTP ${status}).`);
    this.name = 'IntervalsApiError';
  }
}

export class IntervalsClient {
  readonly #config: IntervalsConfig;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(
    config: IntervalsConfig,
    dependencies: { fetch?: typeof fetch; now?: () => Date } = {},
  ) {
    this.#config = validateIntervalsConfig(config);
    this.#fetch = dependencies.fetch ?? globalThis.fetch;
    this.#now = dependencies.now ?? (() => new Date());
  }

  /** Fetch the last N calendar dates, including today, using UTC to select date bounds. */
  async getRecentActivities(days = 7): Promise<ActivitySummary[]> {
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('days must be an integer between 1 and 365.');
    }
    const newest = new Date(this.#now());
    const oldest = new Date(newest);
    oldest.setUTCDate(oldest.getUTCDate() - days + 1);
    const url = new URL(
      `https://intervals.icu/api/v1/athlete/${this.#config.athleteId}/activities`,
    );
    url.searchParams.set('oldest', oldest.toISOString().slice(0, 10));
    url.searchParams.set('newest', newest.toISOString().slice(0, 10));

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`API_KEY:${this.#config.apiKey}`).toString('base64')}`,
        },
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch {
      throw new Error('Intervals API request failed: network error or timeout.');
    }
    if (!response.ok) {
      throw new IntervalsApiError(response.status);
    }

    try {
      return z.array(activitySchema).parse(await response.json());
    } catch {
      throw new Error('Intervals API returned an invalid activities response.');
    }
  }
}
