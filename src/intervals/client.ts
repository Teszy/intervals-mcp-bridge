import { APIClient } from '../api/client.js';
import type { BasicAuth } from '../api/types.js';
import { z } from 'zod';
import { loadIntervalsConfig, type IntervalsConfig } from './config.js';

const activitySchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  type: z.string().nullish(),
  start_date_local: z.string().nullish(),
  distance: z.number().nonnegative().nullish(),
  moving_time: z.number().nonnegative().nullish(),
});

export type ActivitySummary = z.infer<typeof activitySchema>;

export class IntervalsClient {
  readonly #config: IntervalsConfig;
  readonly #api: APIClient;

  constructor(config: IntervalsConfig = loadIntervalsConfig()) {
    this.#config = { ...config };
    const basicAuth: BasicAuth = {
      type: 'basic',
      username: 'API_KEY',
      password: this.#config.apiKey,
    };
    this.#api = new APIClient(this.#config.baseURL, basicAuth);
  }

  /** Fetch the last N calendar dates, including today, using UTC to select date bounds. */
  async getRecentActivities(days = 7): Promise<ActivitySummary[]> {
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('days must be an integer between 1 and 365.');
    }
    const newest = new Date();
    const oldest = new Date(newest);
    oldest.setUTCDate(oldest.getUTCDate() - days + 1);
    const data = await this.#api.get(`/athlete/${this.#config.athleteId}/activities`, {
      oldest: oldest.toISOString().slice(0, 10),
      newest: newest.toISOString().slice(0, 10),
    });

    const result = z.array(activitySchema).safeParse(data);
    if (!result.success) {
      throw new Error('Intervals API returned an invalid activities response.');
    }
    return result.data;
  }
}
