import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntervalsClient } from '../src/intervals/client.js';
import { HTTPResponseValidationError } from '../src/http/errors.js';
import { mockHttp } from './helpers/http.js';

const config = {
  apiKey: 'test-secret',
  athleteId: 'i12345',
  baseURL: 'https://intervals.icu/api/v1',
};
const range = { oldest: '2026-10-01', newest: '2026-10-13' };
afterEach(() => vi.restoreAllMocks());

describe('workload and wellness client', () => {
  it('retrieves session load without adding alternative estimates or filling missing values', async () => {
    const records = [
      {
        id: 'i42',
        type: 'Run',
        icu_training_load: 50,
        power_load: null,
        hr_load: 50,
        pace_load: 45,
        icu_intensity: 80,
      },
      { id: 'restricted' },
      { id: 'i43', icu_training_load: 0 },
    ];
    const adapter = mockHttp(
      records.map((record) => ({ ...record, description: 'private notes' })),
    );
    expect(await new IntervalsClient(config).getActivityWorkload(range)).toEqual(records);
    expect(adapter.mock.calls[0]![0]).toMatchObject({
      url: '/athlete/i12345/activities',
      params: range,
    });
  });
  it('sorts wellness chronologically while preserving nulls, negative ramp rate and settings-derived flags', async () => {
    const records = [
      {
        id: '2026-10-13',
        ctl: 40,
        atl: 55,
        rampRate: -2,
        hrv: null,
        fatigue: 0,
        tempRestingHR: true,
      },
      { id: '2026-10-01', sleepSecs: 28800, sleepQuality: 1, restingHR: 50, hrvSDNN: 40 },
    ];
    const adapter = mockHttp(
      records.map((record) => ({ ...record, comments: 'private notes', menstrualPhase: 'NONE' })),
    );
    expect(await new IntervalsClient(config).getWellness(range)).toEqual([...records].reverse());
    expect(adapter.mock.calls[0]![0]).toMatchObject({
      url: '/athlete/i12345/wellness',
      params: range,
    });
  });
  it.each(['getActivityWorkload', 'getWellness'] as const)(
    '%s accepts empty lists and sparse records',
    async (method) => {
      mockHttp([]);
      expect(await new IntervalsClient(config)[method](range)).toEqual([]);
    },
  );
  it.each(['getActivityWorkload', 'getWellness'] as const)(
    '%s accepts a single day and 90 inclusive days across leap day',
    async (method) => {
      const adapter = mockHttp([]);
      const client = new IntervalsClient(config);
      await client[method]({ oldest: '2024-02-29', newest: '2024-02-29' });
      await client[method]({ oldest: '2024-01-01', newest: '2024-03-30' });
      expect(adapter).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    { oldest: '2026-02-29', newest: '2026-03-01' },
    { oldest: '2026-10-14', newest: '2026-10-13' },
    { oldest: '2024-01-01', newest: '2024-03-31' },
    { oldest: '2026-10-01T00:00:00', newest: '2026-10-13' },
  ])('rejects invalid or oversized ranges before HTTP %j', async (dates) => {
    const adapter = mockHttp([]);
    const client = new IntervalsClient(config);
    await expect(client.getWellness(dates)).rejects.toThrow();
    await expect(client.getActivityWorkload(dates)).rejects.toThrow();
    expect(adapter).not.toHaveBeenCalled();
  });
  it.each(
    [
      [{ id: '2026-10-13' }, { id: '2026-10-13' }],
      [{ id: '2026-09-30' }],
      [{ id: '2026-10-14' }],
    ].map((records) => ({ records })),
  )('rejects duplicate or out-of-range wellness dates %j', async ({ records }) => {
    mockHttp(records);
    await expect(new IntervalsClient(config).getWellness(range)).rejects.toThrow(
      'duplicate or out-of-range',
    );
  });
  it.each(
    [
      [{ id: '2026-02-29' }],
      [{ id: '2026-10-13', hrv: 'bad' }],
      [{ id: '2026-10-13', fatigue: 5 }],
      [{ id: '2026-10-13', sleepSecs: -1 }],
      {},
    ].map((records) => ({ records })),
  )('rejects malformed wellness data %j', async ({ records }) => {
    mockHttp(records);
    await expect(new IntervalsClient(config).getWellness(range)).rejects.toBeInstanceOf(
      HTTPResponseValidationError,
    );
  });
  it('rejects invalid load values', async () => {
    mockHttp([{ id: 'i42', icu_training_load: 'bad' }]);
    await expect(new IntervalsClient(config).getActivityWorkload(range)).rejects.toBeInstanceOf(
      HTTPResponseValidationError,
    );
  });
});
