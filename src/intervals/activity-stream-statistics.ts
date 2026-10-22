import {
  activityStreamUnits,
  type ActivityStreams,
  type ActivityStreamType,
} from '../schemas/streams.js';

export type ActivityStreamStatisticsOptions = {
  startTime?: number | undefined;
  endTime?: number | undefined;
  maxGapSeconds?: number | undefined;
  zones?: { type: ActivityStreamType; boundaries: number[] }[] | undefined;
};

/** Calculate statistics from validated streams using left-held values on [timestamp, next timestamp). */
export function calculateActivityStreamStatistics(
  data: ActivityStreams,
  options: ActivityStreamStatisticsOptions = {},
) {
  const firstTime = data.time[0]!;
  const lastTime = data.time.at(-1)!;
  const start = Math.max(firstTime, options.startTime ?? firstTime);
  const end = Math.min(lastTime, options.endTime ?? lastTime);
  const durationSeconds = Math.max(0, end - start);
  const overlaps = start <= end;
  const maxGapSeconds = options.maxGapSeconds ?? 30;

  // The same interval durations and gap policy apply to every measurement.
  const segments = data.time.slice(0, -1).map((time, index) => {
    const nextTime = data.time[index + 1]!;
    return {
      seconds: Math.max(0, Math.min(end, nextTime) - Math.max(start, time)),
      gap: nextTime - time > maxGapSeconds,
    };
  });
  const gapSeconds = segments.reduce(
    (sum, segment) => sum + (segment.gap ? segment.seconds : 0),
    0,
  );

  const summaries = data.streams.map((stream) => {
    const boundaries = options.zones?.find((zone) => zone.type === stream.type)?.boundaries;
    const zoneSeconds = boundaries ? Array<number>(boundaries.length + 1).fill(0) : undefined;
    let weightedSum = 0;
    let validSeconds = 0;
    let missingSeconds = 0;
    let validSamples = 0;
    let min: number | null = null;
    let max: number | null = null;

    stream.data.forEach((value, index) => {
      const time = data.time[index]!;
      // Extrema describe observed points, including the terminal point, not held values.
      if (value !== null && overlaps && time >= start && time <= end) {
        validSamples++;
        min = min === null ? value : Math.min(min, value);
        max = max === null ? value : Math.max(max, value);
      }
      const segment = segments[index];
      if (!segment || segment.seconds === 0 || segment.gap) return;
      if (value === null) {
        missingSeconds += segment.seconds;
        return;
      }
      validSeconds += segment.seconds;
      weightedSum += value * segment.seconds;
      if (boundaries && zoneSeconds) {
        // Each boundary is the lower inclusive bound of the next zone.
        const zone = boundaries.findIndex((boundary) => value < boundary);
        zoneSeconds[zone === -1 ? boundaries.length : zone]! += segment.seconds;
      }
    });

    return {
      type: stream.type,
      unit: activityStreamUnits[stream.type],
      validSamples,
      min,
      max,
      weightedMean: validSeconds > 0 ? weightedSum / validSeconds : null,
      validSeconds,
      missingSeconds,
      gapSeconds,
      coveragePercent:
        durationSeconds > 0 ? Math.min(100, (validSeconds / durationSeconds) * 100) : null,
      ...(boundaries && zoneSeconds ? { zones: { boundaries, seconds: zoneSeconds } } : {}),
    };
  });

  return {
    startTime: overlaps ? start : null,
    endTime: overlaps ? end : null,
    durationSeconds,
    totalPoints: data.time.length,
    maxGapSeconds,
    method: 'left-held values between consecutive timestamps; long gaps excluded' as const,
    missingStreams: data.missingStreams,
    summaries,
  };
}
