import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';
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
  readonly #http: AxiosInstance;
  readonly #now: () => Date;

  constructor(
    config: IntervalsConfig,
    dependencies: { adapter?: AxiosAdapter; now?: () => Date } = {},
  ) {
    this.#config = validateIntervalsConfig(config);
    this.#http = axios.create({
      baseURL: 'https://intervals.icu/api/v1',
      auth: { username: 'API_KEY', password: this.#config.apiKey },
      headers: { Accept: 'application/json' },
      timeout: 15_000,
      maxRedirects: 0,
      ...(dependencies.adapter ? { adapter: dependencies.adapter } : {}),
    });
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
    let data: unknown;
    try {
      const response = await this.#http.get<unknown>(
        `/athlete/${this.#config.athleteId}/activities`,
        {
          params: {
            oldest: oldest.toISOString().slice(0, 10),
            newest: newest.toISOString().slice(0, 10),
          },
          signal: AbortSignal.timeout(15_000),
        },
      );
      data = response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        throw new IntervalsApiError(error.response.status);
      }
      // Axios errors retain credentials in config; deliberately omit the original cause.
      // eslint-disable-next-line preserve-caught-error
      throw new Error('Intervals API request failed: network error or timeout.');
    }

    const result = z.array(activitySchema).safeParse(data);
    if (!result.success) {
      throw new Error('Intervals API returned an invalid activities response.');
    }
    return result.data;
  }
}
