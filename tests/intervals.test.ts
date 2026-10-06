import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntervalsClient } from '../src/intervals/client.js';
import { loadIntervalsConfig } from '../src/intervals/config.js';
import { mockHttp } from './helpers/http.js';

const config = {
  apiKey: 'test-secret',
  athleteId: 'i12345',
  baseURL: 'https://intervals.icu/api/v1',
};
const env = {
  INTERVALS_API_KEY: 'test-secret',
  INTERVALS_ATHLETE_ID: 'i12345',
  INTERVALS_BASE_URL: 'https://intervals.icu/api/v1',
};

function setup(data: unknown = []) {
  const adapter = mockHttp(data);
  return {
    adapter,
    client: new IntervalsClient(config),
  };
}

beforeEach(() => vi.stubEnv('INTERVALS_BASE_URL', 'https://intervals.icu/api/v1'));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Intervals configuration', () => {
  it('reads and normalizes the environment base URL', () => {
    expect(loadIntervalsConfig({ ...env, INTERVALS_API_KEY: 'key' }).baseURL).toBe(
      'https://intervals.icu/api/v1',
    );
    expect(
      loadIntervalsConfig({
        INTERVALS_API_KEY: 'key',
        INTERVALS_BASE_URL: ' https://example.com/api/ ',
      }).baseURL,
    ).toBe('https://example.com/api');
  });
  it.each([undefined, '', ' ', 'relative/path', 'ftp://example.com'])(
    'rejects invalid base URLs %j',
    (baseURL) => {
      const env = baseURL === undefined ? {} : { INTERVALS_BASE_URL: baseURL };
      expect(() => loadIntervalsConfig({ ...env, INTERVALS_API_KEY: 'key' })).toThrow(
        'Invalid Intervals configuration',
      );
    },
  );
  it('loads and trims environment values', () => {
    expect(
      loadIntervalsConfig({
        ...env,
        INTERVALS_API_KEY: ' key ',
        INTERVALS_ATHLETE_ID: ' i123 ',
      }),
    ).toEqual({ apiKey: 'key', athleteId: 'i123', baseURL: 'https://intervals.icu/api/v1' });
  });

  it('preserves an i-prefixed athlete ID as a string', () => {
    expect(
      loadIntervalsConfig({
        INTERVALS_API_KEY: 'personal-api-key',
        INTERVALS_ATHLETE_ID: 'i123456',
        INTERVALS_BASE_URL: 'https://intervals.icu/api/v1',
      }).athleteId,
    ).toBe('i123456');
  });

  it('defaults the athlete to the API key owner', () => {
    expect(
      loadIntervalsConfig({
        INTERVALS_API_KEY: 'key',
        INTERVALS_BASE_URL: env.INTERVALS_BASE_URL,
      }).athleteId,
    ).toBe('0');
  });

  it('reads process.env by default', () => {
    vi.stubEnv('INTERVALS_API_KEY', 'test-key');
    vi.stubEnv('INTERVALS_ATHLETE_ID', '123');
    try {
      expect(loadIntervalsConfig()).toEqual({
        apiKey: 'test-key',
        athleteId: '123',
        baseURL: 'https://intervals.icu/api/v1',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([{}, { INTERVALS_API_KEY: '' }, { INTERVALS_API_KEY: '   ' }])(
    'rejects missing or blank keys',
    (overrides) => {
      expect(() =>
        loadIntervalsConfig({ ...env, INTERVALS_API_KEY: undefined, ...overrides }),
      ).toThrow('Invalid Intervals configuration');
    },
  );

  it.each(['', ' ', '../other', 'i0', '-1', 'foo', '12?x=1'])('rejects athlete ID %j', (id) => {
    expect(() =>
      loadIntervalsConfig({
        ...env,
        INTERVALS_API_KEY: 'secret',
        INTERVALS_ATHLETE_ID: id,
      }),
    ).toThrow('Invalid Intervals configuration');
  });
});

describe('IntervalsClient', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-03T23:30:00Z'));
  });

  it('loads environment configuration when none is supplied', async () => {
    vi.stubEnv('INTERVALS_API_KEY', ' environment-key ');
    vi.stubEnv('INTERVALS_ATHLETE_ID', ' i456 ');
    const { adapter } = setup();
    const client = new IntervalsClient();
    expect(adapter).not.toHaveBeenCalled();
    await client.getRecentActivities();
    const request = adapter.mock.calls[0]![0];
    expect(request.url).toBe('/athlete/i456/activities');
    expect(request.headers.get('Authorization')).toBe(
      'Basic ' + Buffer.from('API_KEY:environment-key').toString('base64'),
    );
  });

  it('rejects missing environment credentials during construction', () => {
    vi.stubEnv('INTERVALS_API_KEY', '');
    expect(() => new IntervalsClient()).toThrow('Invalid Intervals configuration');
  });

  it('accepts explicit configuration without reading environment credentials', async () => {
    vi.stubEnv('INTERVALS_API_KEY', '');
    const { adapter } = setup();
    await new IntervalsClient({ ...config, athleteId: '0' }).getRecentActivities();
    expect(adapter.mock.calls[0]![0].url).toBe('/athlete/0/activities');
  });

  it('configures authentication, timeout and date bounds and validates summaries', async () => {
    const activity = {
      id: 'i42',
      name: 'Morning run',
      type: 'Run',
      start_date_local: '2026-01-02T08:00:00',
      distance: 5000,
      moving_time: 1800,
    };
    const { client, adapter } = setup([{ ...activity, extra_field: true }]);
    expect(await client.getRecentActivities()).toEqual([activity]);
    expect(adapter).toHaveBeenCalledOnce();
    const request = adapter.mock.calls[0]![0];
    expect(request).toMatchObject({
      baseURL: 'https://intervals.icu/api/v1',
      url: '/athlete/i12345/activities',
      method: 'get',
      timeout: 15_000,
      maxRedirects: 0,
      params: { oldest: '2025-12-28', newest: '2026-01-03' },
      signal: expect.any(AbortSignal),
    });
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(request.headers.get('Authorization')).toBe(
      'Basic ' + Buffer.from('API_KEY:test-secret').toString('base64'),
    );
  });

  it('uses the configured base URL and makes no request during construction', async () => {
    const adapter = mockHttp();
    const client = new IntervalsClient({ ...config, baseURL: 'https://example.com/api' });
    expect(adapter).not.toHaveBeenCalled();
    await client.getRecentActivities();
    expect(adapter.mock.calls[0]![0].baseURL).toBe('https://example.com/api');
  });

  it('supports a single date and empty results', async () => {
    const { client, adapter } = setup();
    expect(await client.getRecentActivities(1)).toEqual([]);
    expect(adapter.mock.calls[0]![0].params).toEqual({
      oldest: '2026-01-03',
      newest: '2026-01-03',
    });
  });

  it('handles leap days', async () => {
    vi.setSystemTime(new Date('2024-03-01T00:00:00Z'));
    const { client, adapter } = setup();
    await client.getRecentActivities(2);
    expect(adapter.mock.calls[0]![0].params).toEqual({
      oldest: '2024-02-29',
      newest: '2024-03-01',
    });
  });

  it('accepts partial summaries and nullable fields', async () => {
    const data = [{ id: 'i1' }, { id: 'i2', name: null, distance: null, moving_time: 0 }];
    expect(await setup(data).client.getRecentActivities()).toEqual(data);
  });

  it.each([0, -1, 366, 1.5, NaN, Infinity])(
    'rejects invalid days %s before requesting',
    async (days) => {
      const { client, adapter } = setup();
      await expect(client.getRecentActivities(days)).rejects.toThrow('days must be an integer');
      expect(adapter).not.toHaveBeenCalled();
    },
  );

  it.each([{}, null, [{ name: 'missing id' }], [{ id: 'i1', distance: 'bad' }], 'not json'])(
    'rejects malformed responses',
    async (data) => {
      await expect(setup(data).client.getRecentActivities()).rejects.toThrow(
        'invalid activities response',
      );
    },
  );

  it('accepts the maximum date range', async () => {
    const { client, adapter } = setup();
    expect(await client.getRecentActivities(365)).toEqual([]);
    expect(adapter.mock.calls[0]![0].params).toEqual({
      oldest: '2025-01-04',
      newest: '2026-01-03',
    });
  });

  it('propagates API client failures', async () => {
    mockHttp([], 503);
    await expect(new IntervalsClient(config).getRecentActivities()).rejects.toMatchObject({
      name: 'HTTPError',
      status: 503,
    });
  });
});
