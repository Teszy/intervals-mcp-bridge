import { APIClient } from '../api/client.js';
import type { BasicAuth } from '../api/types.js';
import { z } from 'zod';
import { loadIntervalsConfig, type IntervalsConfig } from './config.js';
import {
  activityWorkloadSchema,
  wellnessSchema,
  trainingDateRangeSchema,
  type TrainingDateRange,
  type ActivityWorkload,
  type Wellness,
  athleteSettingsSchema,
  type AthleteSettings,
  activityDetailsSchema,
  activityIdSchema,
  activitySchema,
  activityStreamTypesSchema,
  activityStreamsResponseSchema,
  defaultActivityStreamTypes,
  type ActivityStreams,
  type ActivityStreamType,
  type ActivityDetails,
  type ActivitySummary,
} from './schemas.js';

export { activitySchema } from './schemas.js';
export type {
  ActivityDetails,
  ActivitySummary,
  ActivityStreams,
  ActivityStreamType,
} from './schemas.js';

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

  /** Fetch session workload in an inclusive athlete-local date range. */
  async getActivityWorkload(range: TrainingDateRange): Promise<ActivityWorkload[]> {
    const dates = trainingDateRangeSchema.parse(range);
    return this.#api.get(
      `/athlete/${this.#config.athleteId}/activities`,
      z.array(activityWorkloadSchema),
      dates,
    );
  }

  /** Fetch recorded daily wellness and upstream fitness values, without filling gaps. */
  async getWellness(range: TrainingDateRange): Promise<Wellness[]> {
    const dates = trainingDateRangeSchema.parse(range);
    const records = await this.#api.get(
      `/athlete/${this.#config.athleteId}/wellness`,
      z.array(wellnessSchema),
      dates,
    );
    const seen = new Set<string>();
    for (const record of records) {
      if (record.id < dates.oldest || record.id > dates.newest || seen.has(record.id)) {
        throw new Error('Intervals API returned duplicate or out-of-range wellness dates.');
      }
      seen.add(record.id);
    }
    return records.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Fetch current settings, exposing only training context fields. */
  async getAthleteSettings(): Promise<AthleteSettings> {
    const data = await this.#api.get(`/athlete/${this.#config.athleteId}`, athleteSettingsSchema);
    if (this.#config.athleteId !== '0' && data.id !== this.#config.athleteId) {
      throw new Error('Intervals API returned settings for a different athlete.');
    }
    return data;
  }

  /** Fetch the last N calendar dates, including today, using UTC to select date bounds. */
  async getRecentActivities(days = 7): Promise<ActivitySummary[]> {
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('days must be an integer between 1 and 365.');
    }
    const newest = new Date();
    const oldest = new Date(newest);
    oldest.setUTCDate(oldest.getUTCDate() - days + 1);
    const data = await this.#api.get(
      `/athlete/${this.#config.athleteId}/activities`,
      z.array(activitySchema),
      {
        oldest: oldest.toISOString().slice(0, 10),
        newest: newest.toISOString().slice(0, 10),
      },
    );

    return data;
  }

  /** Fetch session metrics and detected work/recovery intervals for one activity. */
  async getActivity(activityId: string): Promise<ActivityDetails> {
    const id = activityIdSchema.safeParse(activityId);
    if (!id.success) throw new Error('Invalid activity ID.');

    const data = await this.#api.get(
      `/activity/${encodeURIComponent(id.data)}`,
      activityDetailsSchema,
      {
        intervals: true,
      },
    );
    if (data.id !== id.data) {
      throw new Error('Intervals API returned details for a different activity.');
    }
    return data;
  }

  /** Retrieve selected scalar measurements aligned with elapsed time in seconds. */
  async getActivityStreams(
    activityId: string,
    types: ActivityStreamType[] = defaultActivityStreamTypes,
  ): Promise<ActivityStreams> {
    const id = activityIdSchema.safeParse(activityId);
    if (!id.success) throw new Error('Invalid activity ID.');
    const selection = activityStreamTypesSchema.safeParse(types);
    if (!selection.success) throw new Error('Invalid activity stream selection.');
    const requestedTypes = [...new Set(selection.data)];

    const data = await this.#api.get(
      `/activity/${encodeURIComponent(id.data)}/streams.json`,
      activityStreamsResponseSchema,
      {
        types: ['time', ...requestedTypes].join(','),
        includeDefaults: false,
      },
    );

    const byType = new Map(data.map((stream) => [stream.type, stream.data]));
    if (byType.size !== data.length) {
      throw new Error('Intervals API returned duplicate activity streams.');
    }
    const time = z.array(z.number().nonnegative()).min(1).safeParse(byType.get('time'));
    if (!time.success) throw new Error('Intervals API returned no usable activity timestamps.');
    if (time.data.some((value, index) => index > 0 && value <= time.data[index - 1]!)) {
      throw new Error('Intervals API returned unordered activity timestamps.');
    }

    const streams: ActivityStreams['streams'] = [];
    const missingStreams: ActivityStreamType[] = [];
    for (const type of requestedTypes) {
      const values = byType.get(type);
      if (!values) {
        missingStreams.push(type);
        continue;
      }
      if (values.length !== time.data.length) {
        throw new Error('Intervals API returned misaligned activity streams.');
      }
      streams.push({ type, data: values });
      if (values.every((value) => value === null)) missingStreams.push(type);
    }
    return { time: time.data, streams, missingStreams };
  }
}
