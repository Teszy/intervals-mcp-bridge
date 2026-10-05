import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntervalsClient } from '../src/intervals/client.js';
import { loadIntervalsConfig } from '../src/intervals/config.js';

const config = { apiKey: 'test-secret', athleteId: 'i12345' };
const now = () => new Date('2026-01-03T23:30:00Z');

function setup(data: unknown = [], status = 200, clock = now) {
  const adapter = vi.fn<AxiosAdapter>().mockImplementation(async (request) => {
    const response: AxiosResponse<unknown> = {
      data,
      status,
      statusText: '',
      headers: {},
      config: request,
    };
    // Adapters are responsible for rejecting unsuccessful HTTP responses.
    if (status < 200 || status >= 300) {
      throw new AxiosError(
        'sensitive server content',
        'ERR_BAD_RESPONSE',
        request,
        undefined,
        response,
      );
    }
    return response;
  });
  return { adapter, client: new IntervalsClient(config, { adapter, now: clock }) };
}

afterEach(() => vi.restoreAllMocks());

describe('Intervals configuration', () => {
  it('loads and trims environment values', () => {
    expect(
      loadIntervalsConfig({ INTERVALS_API_KEY: ' key ', INTERVALS_ATHLETE_ID: ' i123 ' }),
    ).toEqual({ apiKey: 'key', athleteId: 'i123' });
  });

  it('defaults the athlete to the API key owner', () => {
    expect(loadIntervalsConfig({ INTERVALS_API_KEY: 'key' }).athleteId).toBe('0');
  });

  it('reads process.env by default', () => {
    vi.stubEnv('INTERVALS_API_KEY', 'test-key');
    vi.stubEnv('INTERVALS_ATHLETE_ID', '123');
    try {
      expect(loadIntervalsConfig()).toEqual({ apiKey: 'test-key', athleteId: '123' });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([{}, { INTERVALS_API_KEY: '' }, { INTERVALS_API_KEY: '   ' }])(
    'rejects missing or blank keys',
    (env) => {
      expect(() => loadIntervalsConfig(env)).toThrow('Invalid Intervals configuration');
    },
  );

  it.each(['', ' ', '../other', 'i0', '-1', 'foo', '12?x=1'])('rejects athlete ID %j', (id) => {
    expect(() =>
      loadIntervalsConfig({ INTERVALS_API_KEY: 'secret', INTERVALS_ATHLETE_ID: id }),
    ).toThrow('Invalid Intervals configuration');
  });

  it('validates direct client configuration without exposing the key', () => {
    expect(() => new IntervalsClient({ ...config, athleteId: 'invalid' })).toThrow(
      'Invalid Intervals configuration: provide an API key and a valid athlete ID.',
    );
  });
});

describe('IntervalsClient', () => {
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
      auth: { username: 'API_KEY', password: 'test-secret' },
      timeout: 15_000,
      maxRedirects: 0,
      params: { oldest: '2025-12-28', newest: '2026-01-03' },
      signal: expect.any(AbortSignal),
    });
    expect(request.headers.get('Accept')).toBe('application/json');
  });

  it('reuses one Axios instance across requests', async () => {
    const create = vi.spyOn(axios, 'create');
    const { client } = setup();
    await client.getRecentActivities();
    await client.getRecentActivities(1);
    expect(create).toHaveBeenCalledOnce();
  });

  it('supports a single date and empty results', async () => {
    const { client, adapter } = setup();
    expect(await client.getRecentActivities(1)).toEqual([]);
    expect(adapter.mock.calls[0]![0].params).toEqual({
      oldest: '2026-01-03',
      newest: '2026-01-03',
    });
  });

  it('handles leap days without mutating the clock', async () => {
    const date = new Date('2024-03-01T00:00:00Z');
    const { client, adapter } = setup([], 200, () => date);
    await client.getRecentActivities(2);
    expect(adapter.mock.calls[0]![0].params).toEqual({
      oldest: '2024-02-29',
      newest: '2024-03-01',
    });
    expect(date.toISOString()).toBe('2024-03-01T00:00:00.000Z');
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

  it.each([302, 401, 403, 429, 500])(
    'maps HTTP %s without leaking Axios config or response data',
    async (status) => {
      const { client } = setup('sensitive server content', status);
      const error: unknown = await client.getRecentActivities().catch((error: unknown) => error);
      expect(error).toMatchObject({
        name: 'IntervalsApiError',
        status,
        message: `Intervals API request failed (HTTP ${status}).`,
      });
      expect(error).not.toHaveProperty('config');
      expect(error).not.toHaveProperty('response');
      expect(error).not.toHaveProperty('cause');
      expect(String(error)).not.toContain('test-secret');
      expect(String(error)).not.toContain('sensitive server content');
    },
  );

  it.each([
    new Error('test-secret'),
    new AxiosError('test-secret', 'ERR_NETWORK'),
    new AxiosError('test-secret', 'ECONNABORTED'),
  ])('sanitizes transport errors', async (error) => {
    const { client, adapter } = setup();
    adapter.mockRejectedValue(error);
    await expect(client.getRecentActivities()).rejects.toThrow(
      'Intervals API request failed: network error or timeout.',
    );
  });

  it('cancels a stalled request using the deadline signal', async () => {
    const { client, adapter } = setup();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    adapter.mockImplementation(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener?.('abort', () =>
            reject(new AxiosError('timeout', 'ERR_CANCELED')),
          );
        }),
    );
    const request = client.getRecentActivities();
    expect(timeout).toHaveBeenCalledWith(15_000);
    controller.abort();
    await expect(request).rejects.toThrow('network error or timeout');
  });

  it.each([{}, null, [{ name: 'missing id' }], [{ id: 'i1', distance: 'bad' }], 'not json'])(
    'rejects malformed responses',
    async (data) => {
      await expect(setup(data).client.getRecentActivities()).rejects.toThrow(
        'invalid activities response',
      );
    },
  );

  it('parses JSON through Axios before validation', async () => {
    expect(await setup('[{"id":"i1"}]').client.getRecentActivities()).toEqual([{ id: 'i1' }]);
  });

  it('uses default Axios transport configuration and current clock', async () => {
    const { adapter } = setup();
    const create = axios.create.bind(axios);
    vi.spyOn(axios, 'create').mockImplementation((options) => create({ ...options, adapter }));
    expect(await new IntervalsClient(config).getRecentActivities(365)).toEqual([]);
    expect(adapter.mock.calls[0]![0].params.newest).toBe(new Date().toISOString().slice(0, 10));
  });
});
