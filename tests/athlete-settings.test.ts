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
  it('preserves a descending final rowing HR limit and warns without losing other settings', async () => {
    const running = { id: 1, types: ['Run'], hr_zones: [130, 150, 190] };
    mockHttp({
      id: 'i12345',
      timezone: 'Europe/Budapest',
      sportSettings: [
        running,
        {
          id: 2,
          types: ['Rowing'],
          hr_zones: [140, 156, 163, 174, 179, 184, 183],
          power_zones: [55, 75, 100],
          max_hr: 183,
        },
      ],
    });
    const result = await new IntervalsClient(config).getAthleteSettings();
    expect(result.timezone).toBe('Europe/Budapest');
    expect(result.sportSettings[0]).toEqual(running);
    expect(result.sportSettings[1]).toMatchObject({
      hr_zones: [140, 156, 163, 174, 179, 184, 183],
      power_zones: [55, 75, 100],
      max_hr: 183,
    });
    expect(result.zoneWarnings).toEqual([
      { sportSettingsId: 2, types: ['Rowing'], field: 'hr_zones', code: 'INVALID_ZONE_LIMITS' },
    ]);
  });
  it.each(['hr_zones', 'power_zones', 'pace_zones'] as const)(
    'preserves non-increasing %s arrays with advisory warnings',
    async (field) => {
      for (const limits of [
        [150, 130],
        [100, 100],
      ]) {
        mockHttp({
          id: 'i12345',
          sportSettings: [{ id: 1, types: ['Run'], [field]: limits, ftp: 250 }],
        });
        const result = await new IntervalsClient(config).getAthleteSettings();
        expect(result.sportSettings[0]).toMatchObject({ [field]: limits, ftp: 250 });
        expect(result.zoneWarnings).toEqual([
          { sportSettingsId: 1, types: ['Run'], field, code: 'INVALID_ZONE_LIMITS' },
        ]);
      }
    },
  );
  it('does not constrain numeric zone values beyond the upstream data type', async () => {
    const profile = { id: 1, types: ['Run'], hr_zones: [-1, 150], power_zones: [0, 100] };
    mockHttp({ id: 'i12345', sportSettings: [profile] });
    expect(await new IntervalsClient(config).getAthleteSettings()).toEqual({
      id: 'i12345',
      sportSettings: [profile],
    });
  });
  it('preserves null and missing zones without warnings and ignores upstream warning fields', async () => {
    const profile = { id: 1, types: ['Run'], hr_zones: null, pace_zones: [] };
    mockHttp({ id: 'i12345', sportSettings: [profile], zoneWarnings: ['untrusted-warning'] });
    expect(await new IntervalsClient(config).getAthleteSettings()).toEqual({
      id: 'i12345',
      sportSettings: [profile],
    });
  });
  it.each([
    { id: 'other', sportSettings: [] },
    { id: 'i12345', sportSettings: [{ id: 1, types: ['Run'], hr_zones: ['150'] }] },
    { id: 'i12345', sportSettings: [{ id: 1, types: ['Run'], pace_zones: {} }] },
    {},
    { id: 'i12345', sportSettings: [{ id: 1, types: ['Run'], ftp: '250' }] },
  ])('rejects invalid or mismatched responses %j', async (data) => {
    mockHttp(data);
    await expect(new IntervalsClient(config).getAthleteSettings()).rejects.toThrow(
      /Intervals API returned|API response does not match/,
    );
  });
});
