import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntervalsApiError, IntervalsClient } from '../src/intervals/client.js';
import { loadIntervalsConfig } from '../src/intervals/config.js';

const config = { apiKey: 'test-secret', athleteId: 'i12345' };
const now = () => new Date('2026-01-03T23:30:00Z');

function setup(response = Response.json([])) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  return { fetchMock, client: new IntervalsClient(config, { fetch: fetchMock, now }) };
}

afterEach(() => vi.unstubAllGlobals());

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
  it('requests the last seven dates with Basic authentication and parses summaries', async () => {
    const activity = {
      id: 'i42',
      name: 'Morning run',
      type: 'Run',
      start_date_local: '2026-01-02T08:00:00',
      distance: 5000,
      moving_time: 1800,
    };
    const { client, fetchMock } = setup(Response.json([{ ...activity, extra_field: true }]));
    expect(await client.getRecentActivities()).toEqual([activity]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL(
        'https://intervals.icu/api/v1/athlete/i12345/activities?oldest=2025-12-28&newest=2026-01-03',
      ),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from('API_KEY:test-secret').toString('base64')}`,
        },
        signal: expect.any(AbortSignal),
        redirect: 'error',
      },
    );
  });

  it('supports a single date and empty results', async () => {
    const { client, fetchMock } = setup();
    expect(await client.getRecentActivities(1)).toEqual([]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('oldest=2026-01-03&newest=2026-01-03');
  });

  it('handles leap days without mutating the injected clock', async () => {
    const date = new Date('2024-03-01T00:00:00Z');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    await new IntervalsClient(config, { fetch: fetchMock, now: () => date }).getRecentActivities(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('oldest=2024-02-29&newest=2024-03-01');
    expect(date.toISOString()).toBe('2024-03-01T00:00:00.000Z');
  });

  it('accepts partial summaries and nullable fields', async () => {
    const data = [{ id: 'i1' }, { id: 'i2', name: null, distance: null, moving_time: 0 }];
    expect(await setup(Response.json(data)).client.getRecentActivities()).toEqual(data);
  });

  it.each([0, -1, 366, 1.5, NaN, Infinity])(
    'rejects invalid days %s before fetching',
    async (days) => {
      const { client, fetchMock } = setup();
      await expect(client.getRecentActivities(days)).rejects.toThrow('days must be an integer');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 429, 500])('exposes HTTP %s without the response body', async (status) => {
    const { client } = setup(new Response('sensitive server content', { status }));
    await expect(client.getRecentActivities()).rejects.toMatchObject({
      name: 'IntervalsApiError',
      status,
      message: `Intervals API request failed (HTTP ${status}).`,
    });
    expect(new IntervalsApiError(status)).toBeInstanceOf(Error);
  });

  it('sanitizes network errors', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockRejectedValue(new Error('test-secret'));
    await expect(client.getRecentActivities()).rejects.toThrow(
      'Intervals API request failed: network error or timeout.',
    );
  });

  it('aborts a stalled request after 15 seconds', async () => {
    const { client, fetchMock } = setup();
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('timeout')));
        }),
    );
    try {
      const request = client.getRecentActivities();
      expect(timeout).toHaveBeenCalledWith(15_000);
      controller.abort();
      await expect(request).rejects.toThrow('network error or timeout');
    } finally {
      timeout.mockRestore();
    }
  });

  it.each([{}, null, [{ name: 'missing id' }], [{ id: 'i1', distance: 'bad' }]])(
    'rejects malformed activity data',
    async (data) => {
      await expect(setup(Response.json(data)).client.getRecentActivities()).rejects.toThrow(
        'invalid activities response',
      );
    },
  );

  it('rejects invalid JSON', async () => {
    await expect(setup(new Response('not json')).client.getRecentActivities()).rejects.toThrow(
      'invalid activities response',
    );
  });

  it('uses global fetch and the current clock by default', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json([])));
    expect(await new IntervalsClient(config).getRecentActivities(365)).toEqual([]);
  });
});
