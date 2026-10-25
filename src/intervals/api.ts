import { UpstreamDataError } from '../errors.js';
import { addZoneWarnings } from './zone-warnings.js';
import { HTTPClient } from '../http/client.js';
import type { BasicAuth } from '../http/auth.js';
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
export class IntervalsApi {
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
    signal?: AbortSignal,
  ): Promise<PlannedWorkoutEvent> {
    const event = await this.#http.post(
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
      signal,
    );
    if (
      event.start_date_local !== workout.startDateLocal ||
      event.type !== workout.sport ||
      (event.external_id != null && event.external_id !== externalId)
    ) {
      throw new UpstreamDataError(
        'Intervals API returned a planned workout that does not match the published draft.',
      );
    }
    return event;
  }

  /** Fetch session workload in an inclusive athlete-local date range. */
  async getActivityWorkload(
    dates: TrainingDateRange,
    signal?: AbortSignal,
  ): Promise<ActivityWorkload[]> {
    return this.#http.get(
      `/athlete/${this.#config.athleteId}/activities`,
      z.array(activityWorkloadSchema),
      dates,
      signal,
    );
  }

  /** Fetch recorded daily wellness and upstream fitness values, without filling gaps. */
  async getWellness(dates: TrainingDateRange, signal?: AbortSignal): Promise<Wellness[]> {
    const records = await this.#http.get(
      `/athlete/${this.#config.athleteId}/wellness`,
      z.array(wellnessSchema),
      dates,
      signal,
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
  async getAthleteSettings(signal?: AbortSignal): Promise<AthleteSettings> {
    const data = await this.#http.get(
      `/athlete/${this.#config.athleteId}`,
      athleteSettingsResponseSchema,
      undefined,
      signal,
    );
    if (this.#config.athleteId !== '0' && data.id !== this.#config.athleteId) {
      throw new UpstreamDataError('Intervals API returned settings for a different athlete.');
    }
    return addZoneWarnings(data);
  }

  /** Fetch activity summaries in an inclusive athlete-local date range. */
  async getRecentActivities(
    dates: TrainingDateRange,
    signal?: AbortSignal,
  ): Promise<ActivitySummary[]> {
    return this.#http.get(
      `/athlete/${this.#config.athleteId}/activities`,
      z.array(activitySummarySchema),
      dates,
      signal,
    );
  }

  /** Fetch session metrics and detected work/recovery intervals for one activity. */
  async getActivity(activityId: string, signal?: AbortSignal): Promise<ActivityDetails> {
    const data = await this.#http.get(
      `/activity/${encodeURIComponent(activityId)}`,
      activityDetailsSchema,
      {
        intervals: true,
      },
      signal,
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
    signal?: AbortSignal,
  ): Promise<ActivityStreams> {
    const requestedTypes = [...new Set(types)];

    const data = await this.#http.get(
      `/activity/${encodeURIComponent(activityId)}/streams.json`,
      activityStreamsResponseSchema,
      {
        types: ['time', ...requestedTypes].join(','),
        includeDefaults: false,
      },
      signal,
    );

    const byType = new Map(data.map((stream) => [stream.type, stream.data]));
    if (byType.size !== data.length) {
      throw new UpstreamDataError('Intervals API returned duplicate activity streams.');
    }
    const timestamps = z.array(z.number().nonnegative()).min(1).safeParse(byType.get('time'));
    if (!timestamps.success) {
      throw new UpstreamDataError('Intervals API returned no usable activity timestamps.');
    }
    const time = timestamps.data;
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
