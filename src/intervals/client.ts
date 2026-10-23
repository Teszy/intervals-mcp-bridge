import { parseWithError } from '../validation.js';
import { UpstreamDataError } from '../errors.js';
import { addZoneWarnings } from '../app/athlete-settings/zone-warnings.js';
import { HTTPClient } from '../http/client.js';
import type { BasicAuth } from '../http/types.js';
import { z } from 'zod';
import { loadIntervalsConfig, type IntervalsConfig } from './config.js';
import { plannedWorkoutEventSchema, type PlannedWorkoutEvent } from '../schemas/events.js';
import type { PlannedWorkout } from '../schemas/workouts.js';
import {
  activityWorkloadSchema,
  type ActivityWorkload,
  activityDetailsSchema,
  activitySummarySchema,
  type ActivityDetails,
  type ActivitySummary,
} from '../schemas/activities.js';
import { wellnessSchema, type Wellness } from '../schemas/wellness.js';
import type { TrainingDateRange } from '../schemas/date-range.js';
import {
  athleteSettingsResponseSchema,
  type AthleteSettings,
} from '../schemas/athlete-settings.js';
import {
  activityStreamsResponseSchema,
  defaultActivityStreamTypes,
  type ActivityStreams,
  type ActivityStreamType,
} from '../schemas/streams.js';

export { activitySummarySchema } from '../schemas/activities.js';
export type { ActivityDetails, ActivitySummary } from '../schemas/activities.js';
export type { ActivityStreams, ActivityStreamType } from '../schemas/streams.js';

/** Internal adapter: callers validate inputs at the application boundary; responses are validated here. */
export class IntervalsClient {
  readonly #config: IntervalsConfig;
  readonly #http: HTTPClient;

  constructor(config: IntervalsConfig = loadIntervalsConfig()) {
    this.#config = { ...config };
    const basicAuth: BasicAuth = {
      type: 'basic',
      username: 'API_KEY',
      password: this.#config.apiKey,
    };
    this.#http = new HTTPClient(this.#config.baseURL, basicAuth);
  }

  /** Create a planned calendar workout from a validated FIT preview. No automatic retries. */
  async publishPlannedWorkout(
    workout: PlannedWorkout,
    fit: Uint8Array,
    externalId: string,
  ): Promise<PlannedWorkoutEvent> {
    return this.#http.post(
      `/athlete/${this.#config.athleteId}/events?upsertOnUid=false`,
      plannedWorkoutEventSchema,
      {
        category: 'WORKOUT',
        type: workout.sport,
        name: workout.name,
        start_date_local: workout.startDateLocal,
        external_id: externalId,
        filename: 'workout.fit',
        file_contents_base64: Buffer.from(fit).toString('base64'),
      },
    );
  }

  /** Fetch session workload in an inclusive athlete-local date range. */
  async getActivityWorkload(dates: TrainingDateRange): Promise<ActivityWorkload[]> {
    return this.#http.get(
      `/athlete/${this.#config.athleteId}/activities`,
      z.array(activityWorkloadSchema),
      dates,
    );
  }

  /** Fetch recorded daily wellness and upstream fitness values, without filling gaps. */
  async getWellness(dates: TrainingDateRange): Promise<Wellness[]> {
    const records = await this.#http.get(
      `/athlete/${this.#config.athleteId}/wellness`,
      z.array(wellnessSchema),
      dates,
    );
    const seen = new Set<string>();
    for (const record of records) {
      if (record.id < dates.oldest || record.id > dates.newest || seen.has(record.id)) {
        throw new UpstreamDataError(
          'Intervals API returned duplicate or out-of-range wellness dates.',
        );
      }
      seen.add(record.id);
    }
    return records.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Fetch current settings, exposing only training context fields. */
  async getAthleteSettings(): Promise<AthleteSettings> {
    const data = await this.#http.get(
      `/athlete/${this.#config.athleteId}`,
      athleteSettingsResponseSchema,
    );
    if (this.#config.athleteId !== '0' && data.id !== this.#config.athleteId) {
      throw new UpstreamDataError('Intervals API returned settings for a different athlete.');
    }
    return addZoneWarnings(data);
  }

  /** Fetch the last N calendar dates, including today, using UTC to select date bounds. */
  async getRecentActivities(days = 7): Promise<ActivitySummary[]> {
    const newest = new Date();
    const oldest = new Date(newest);
    oldest.setUTCDate(oldest.getUTCDate() - days + 1);
    const data = await this.#http.get(
      `/athlete/${this.#config.athleteId}/activities`,
      z.array(activitySummarySchema),
      {
        oldest: oldest.toISOString().slice(0, 10),
        newest: newest.toISOString().slice(0, 10),
      },
    );

    return data;
  }

  /** Fetch session metrics and detected work/recovery intervals for one activity. */
  async getActivity(activityId: string): Promise<ActivityDetails> {
    const data = await this.#http.get(
      `/activity/${encodeURIComponent(activityId)}`,
      activityDetailsSchema,
      {
        intervals: true,
      },
    );
    if (data.id !== activityId) {
      throw new UpstreamDataError('Intervals API returned details for a different activity.');
    }
    return data;
  }

  /** Retrieve selected scalar measurements aligned with elapsed time in seconds. */
  async getActivityStreams(
    activityId: string,
    types: ActivityStreamType[] = defaultActivityStreamTypes,
  ): Promise<ActivityStreams> {
    const requestedTypes = [...new Set(types)];

    const data = await this.#http.get(
      `/activity/${encodeURIComponent(activityId)}/streams.json`,
      activityStreamsResponseSchema,
      {
        types: ['time', ...requestedTypes].join(','),
        includeDefaults: false,
      },
    );

    const byType = new Map(data.map((stream) => [stream.type, stream.data]));
    if (byType.size !== data.length) {
      throw new UpstreamDataError('Intervals API returned duplicate activity streams.');
    }
    const time = parseWithError(
      z.array(z.number().nonnegative()).min(1),
      byType.get('time'),
      (cause) =>
        new UpstreamDataError('Intervals API returned no usable activity timestamps.', { cause }),
    );
    if (time.some((value, index) => index > 0 && value <= time[index - 1]!)) {
      throw new UpstreamDataError('Intervals API returned unordered activity timestamps.');
    }

    const streams: ActivityStreams['streams'] = [];
    const missingStreams: ActivityStreamType[] = [];
    for (const type of requestedTypes) {
      const values = byType.get(type);
      if (!values) {
        missingStreams.push(type);
        continue;
      }
      if (values.length !== time.length) {
        throw new UpstreamDataError('Intervals API returned misaligned activity streams.');
      }
      streams.push({ type, data: values });
      if (values.every((value) => value === null)) missingStreams.push(type);
    }
    return { time, streams, missingStreams };
  }
}
