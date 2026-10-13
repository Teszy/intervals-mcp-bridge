import { describe, expect, it } from 'vitest';
import { calculateActivityStreamStatistics } from '../src/intervals/activity-stream-statistics.js';
import type { ActivityStreams } from '../src/intervals/schemas.js';

function streams(time: number[], values: (number | null)[]): ActivityStreams {
  return { time, streams: [{ type: 'heartrate', data: values }], missingStreams: [] };
}

describe('full-resolution stream statistics', () => {
  it('weights irregular intervals by duration and gives the terminal point no duration', () => {
    const result = calculateActivityStreamStatistics(streams([0, 10, 30], [100, 200, 900]));
    expect(result.durationSeconds).toBe(30);
    expect(result.summaries[0]).toMatchObject({
      validSamples: 3,
      min: 100,
      max: 900,
      validSeconds: 30,
      missingSeconds: 0,
      gapSeconds: 0,
      coveragePercent: 100,
    });
    expect(result.summaries[0]!.weightedMean).toBeCloseTo(5000 / 30);
  });

  it('clips boundary intervals instead of discarding data between timestamps', () => {
    const result = calculateActivityStreamStatistics(streams([0, 10, 30], [100, 200, 900]), {
      startTime: 5,
      endTime: 25,
    });
    expect(result).toMatchObject({ startTime: 5, endTime: 25, durationSeconds: 20 });
    expect(result.summaries[0]).toMatchObject({
      weightedMean: 175,
      validSeconds: 20,
      validSamples: 1,
      min: 200,
      max: 200,
    });
  });

  it('excludes null intervals but includes measured zero values in the denominator', () => {
    const result = calculateActivityStreamStatistics(
      streams([0, 10, 20, 30], [0, null, 100, null]),
    );
    expect(result.summaries[0]).toMatchObject({
      weightedMean: 50,
      validSeconds: 20,
      missingSeconds: 10,
      min: 0,
      max: 100,
    });
    expect(result.summaries[0]!.coveragePercent).toBeCloseTo(200 / 3);
  });

  it('separates long gaps from null durations and honors the configured gap limit', () => {
    const data = streams([0, 10, 70, 80], [100, null, 300, 400]);
    expect(calculateActivityStreamStatistics(data).summaries[0]).toMatchObject({
      weightedMean: 200,
      validSeconds: 20,
      missingSeconds: 0,
      gapSeconds: 60,
      coveragePercent: 25,
    });
    expect(
      calculateActivityStreamStatistics(data, { maxGapSeconds: 60 }).summaries[0],
    ).toMatchObject({
      validSeconds: 20,
      missingSeconds: 60,
      gapSeconds: 0,
    });
  });

  it('calculates zone durations with inclusive lower bounds and excludes missing values', () => {
    const result = calculateActivityStreamStatistics(
      streams([0, 10, 20, 30, 40], [100, 120, 150, null, 200]),
      {
        zones: [{ type: 'heartrate', boundaries: [120, 150] }],
      },
    );
    expect(result.summaries[0]).toMatchObject({
      validSeconds: 30,
      missingSeconds: 10,
      zones: { boundaries: [120, 150], seconds: [10, 10, 10] },
    });
  });

  it('returns null statistics for an all-null sensor without inventing zeros', () => {
    expect(
      calculateActivityStreamStatistics(streams([0, 10], [null, null])).summaries[0],
    ).toMatchObject({
      weightedMean: null,
      min: null,
      max: null,
      validSamples: 0,
      validSeconds: 0,
      missingSeconds: 10,
      coveragePercent: 0,
    });
  });

  it.each([
    [{ startTime: 40 }, null, null],
    [{ endTime: 0 }, 0, 0],
  ])('handles empty or zero-duration windows %j', (options, startTime, endTime) => {
    const result = calculateActivityStreamStatistics(streams([0, 10], [100, 200]), options);
    expect(result).toMatchObject({ startTime, endTime, durationSeconds: 0 });
    expect(result.summaries[0]).toMatchObject({ weightedMean: null, coveragePercent: null });
  });

  it('does not extrapolate a single sample or synthesize absent streams', () => {
    const data = { ...streams([10], [100]), missingStreams: ['watts'] as const };
    const result = calculateActivityStreamStatistics({
      ...data,
      missingStreams: [...data.missingStreams],
    });
    expect(result).toMatchObject({
      startTime: 10,
      endTime: 10,
      durationSeconds: 0,
      missingStreams: ['watts'],
      summaries: [{ weightedMean: null, min: 100, max: 100, validSamples: 1 }],
    });
  });
});
