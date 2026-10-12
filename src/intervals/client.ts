import { APIClient } from '../api/client.js';
import type { BasicAuth } from '../api/types.js';
import { z } from 'zod';
import { loadIntervalsConfig, type IntervalsConfig } from './config.js';
import {
  activityDetailsSchema,
  activityIdSchema,
  activitySchema,
  type ActivityDetails,
  type ActivitySummary,
} from './schemas.js';

export { activitySchema } from './schemas.js';
export type { ActivityDetails, ActivitySummary } from './schemas.js';

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

  /** Fetch session metrics and detected work/recovery intervals for one activity. */
  async getActivity(activityId: string): Promise<ActivityDetails> {
    const id = activityIdSchema.safeParse(activityId);
    if (!id.success) throw new Error('Invalid activity ID.');

    const data = await this.#api.get(`/activity/${encodeURIComponent(id.data)}`, {
      intervals: true,
    });
    const result = activityDetailsSchema.safeParse(data);
    if (!result.success) {
      throw new Error('Intervals API returned invalid or unavailable activity details.');
    }
    if (result.data.id !== id.data) {
      throw new Error('Intervals API returned details for a different activity.');
    }
    return result.data;
  }
}
