import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntervalsClient } from '../src/intervals/client.js';
import { mockHttp } from './helpers/http.js';

const config = {
  apiKey: 'test-secret',
  athleteId: 'i12345',
  baseURL: 'https://intervals.icu/api/v1',
};
afterEach(() => vi.restoreAllMocks());

describe('athlete settings', () => {
  it('fetches configured athlete and strips account secrets and unrelated fields', async () => {
    const adapter = mockHttp({
      id: 'i12345',
      timezone: 'Europe/Budapest',
      icu_api_key: 'private-key',
      email: 'private@example.com',
      sportSettings: [
        {
          id: 1,
          types: ['Run', 'TrailRun'],
          threshold_pace: 3.5,
          pace_units: 'MINS_KM',
          pace_zones: [80, 100, 999],
          hr_zones: [130, 150, 190],
          ftp: null,
          privateField: 'private',
        },
      ],
    });
    const result = await new IntervalsClient(config).getAthleteSettings();
    expect(adapter.mock.calls[0]![0].url).toBe('/athlete/i12345');
    expect(result.sportSettings[0]).toMatchObject({
      threshold_pace: 3.5,
      pace_units: 'MINS_KM',
      pace_zones: [80, 100, 999],
      ftp: null,
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('preserves missing settings and empty profiles', async () => {
    mockHttp({ id: 'i12345', sportSettings: [] });
    expect(await new IntervalsClient(config).getAthleteSettings()).toEqual({
      id: 'i12345',
      sportSettings: [],
    });
  });
  it('supports the authenticated-athlete alias', async () => {
    mockHttp({ id: 'i12345', sportSettings: [] });
    expect(
      await new IntervalsClient({ ...config, athleteId: '0' }).getAthleteSettings(),
    ).toHaveProperty('id', 'i12345');
  });
  it.each([
    { id: 'other', sportSettings: [] },
    {},
    { id: 'i12345', sportSettings: [{ id: 1, types: ['Run'], hr_zones: [150, 130] }] },
    { id: 'i12345', sportSettings: [{ id: 1, types: ['Run'], ftp: '250' }] },
  ])('rejects invalid or mismatched responses %j', async (data) => {
    mockHttp(data);
    await expect(new IntervalsClient(config).getAthleteSettings()).rejects.toThrow(
      /Intervals API returned|API response does not match/,
    );
  });
});
