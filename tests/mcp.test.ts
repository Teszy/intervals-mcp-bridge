import { IntervalsClient } from '../src/intervals/client.js';
import { plannedWorkout, plannedEvent } from './fixtures/workout.js';
import { InMemoryTransport, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageInfo from '../package.json' with { type: 'json' };
import { createServer } from '../src/mcp/server.js';
import { mockHttp } from './helpers/http.js';
import { activityDetails } from './fixtures/activities.js';
import { activityStreams } from './fixtures/streams.js';

const config = {
  apiKey: 'test-secret',
  athleteId: 'i12345',
  baseURL: 'https://intervals.icu/api/v1',
};
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

async function connect() {
  const server = createServer(config);
  servers.push(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  let id = 0;
  async function request(method: string, params: Record<string, unknown> = {}) {
    const requestId = ++id;
    const response = new Promise<JSONRPCMessage>((resolve) => {
      clientTransport.onmessage = (message) => {
        if ('id' in message && message.id === requestId) resolve(message);
      };
    });
    await clientTransport.send({ jsonrpc: '2.0', id: requestId, method, params });
    return response;
  }
  await server.connect(serverTransport);
  await clientTransport.start();
  const initialized = await request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  });
  expect(initialized).toHaveProperty('result.serverInfo.name', 'intervals-mcp-bridge');
  expect(initialized).toHaveProperty('result.serverInfo.version', packageInfo.version);
  await clientTransport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return request;
}

describe('MCP recent activities tool', () => {
  it('advertises its input/output schemas and read-only annotation', async () => {
    const adapter = mockHttp();
    const request = await connect();
    expect(await request('tools/list')).toMatchObject({
      result: {
        tools: [
          {
            name: 'list_recent_activities',
            inputSchema: { properties: { days: { minimum: 1, maximum: 365, default: 7 } } },
            outputSchema: { properties: { activities: { type: 'array' } } },
            annotations: { readOnlyHint: true },
          },
          {
            name: 'get_activity_details',
            inputSchema: { required: ['activityId'] },
            outputSchema: { properties: { activity: { type: 'object' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'get_activity_stream_overview',
            inputSchema: {
              required: ['activityId'],
              properties: { maxPoints: { minimum: 2, maximum: 500, default: 200 } },
            },
            outputSchema: { properties: { time: { type: 'array' }, sampled: { type: 'boolean' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'get_activity_stream_page',
            inputSchema: {
              properties: {
                pageSize: { minimum: 1, maximum: 500, default: 200 },
                offset: { default: 0 },
              },
            },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'get_activity_stream_statistics',
            inputSchema: {
              required: ['activityId'],
              properties: { maxGapSeconds: { default: 30 } },
            },
            outputSchema: { properties: { summaries: { type: 'array' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'get_athlete_settings',
            inputSchema: { type: 'object' },
            outputSchema: { properties: { settings: { type: 'object' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'list_activity_workload',
            inputSchema: { required: ['oldest', 'newest'] },
            outputSchema: { properties: { activities: { type: 'array' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'list_wellness',
            inputSchema: { required: ['oldest', 'newest'] },
            outputSchema: { properties: { wellness: { type: 'array' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'preview_planned_workout',
            annotations: { readOnlyHint: true, openWorldHint: false },
          },
          {
            name: 'publish_planned_workout',
            inputSchema: { required: ['draftId', 'approved'] },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
          },
        ],
      },
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each([undefined, 30])('returns validated structured results for days=%s', async (days) => {
    const activities = [{ id: 'i42', name: 'Run' }];
    const adapter = mockHttp(activities);
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'list_recent_activities',
        ...(days === undefined ? {} : { arguments: { days } }),
      }),
    ).toMatchObject({
      result: {
        structuredContent: { activities },
        content: [{ type: 'text', text: JSON.stringify({ activities }) }],
      },
    });
    const params = adapter.mock.calls[0]![0].params;
    const difference = (Date.parse(params.newest) - Date.parse(params.oldest)) / 86_400_000;
    expect(difference).toBe((days ?? 7) - 1);
  });

  it('returns empty activities as a successful result', async () => {
    mockHttp([]);
    const request = await connect();
    const response = await request('tools/call', { name: 'list_recent_activities', arguments: {} });
    expect(response).toHaveProperty('result.structuredContent.activities', []);
    expect(response).not.toHaveProperty('result.isError', true);
  });

  it.each([
    { name: 'list_recent_activities', arguments: { day: 7 } },
    { name: 'get_athlete_settings', arguments: { extra: true } },
    {
      name: 'list_wellness',
      arguments: { oldest: '2026-10-01', newest: '2026-10-02', extra: true },
    },
    {
      name: 'get_activity_stream_statistics',
      arguments: { activityId: 'i1', zones: [{ type: 'watts', boundaries: [100], extra: true }] },
    },
    { name: 'preview_planned_workout', arguments: { workout: plannedWorkout, extra: true } },
  ])('rejects unknown input fields before HTTP: $name', async (params) => {
    const adapter = mockHttp();
    const request = await connect();
    const response = await request('tools/call', params);
    expect(response).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each([0, -1, 366, 1.5, NaN, Infinity, '7'])(
    'rejects invalid days %s before requesting',
    async (days) => {
      const adapter = mockHttp();
      const request = await connect();
      const response = await request('tools/call', {
        name: 'list_recent_activities',
        arguments: { days },
      });
      expect(response).toHaveProperty('result.isError', true);
      expect(adapter).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 500])('reports HTTP %s as a sanitized tool error', async (status) => {
    mockHttp('test-secret response body', status);
    const request = await connect();
    const response = await request('tools/call', { name: 'list_recent_activities', arguments: {} });
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: `HTTP request failed (HTTP ${status}).` }],
      },
    });
    expect(JSON.stringify(response)).not.toContain('test-secret');
  });

  it('lets the SDK format sanitized unexpected handler exceptions as tool errors', async () => {
    vi.spyOn(IntervalsClient.prototype, 'getRecentActivities').mockRejectedValue(
      new TypeError('secret diagnostic'),
    );
    const request = await connect();
    const response = await request('tools/call', { name: 'list_recent_activities', arguments: {} });
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [
          { type: 'text', text: 'Unable to complete the operation due to an internal error.' },
        ],
      },
    });
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('keeps SDK output validation errors separate and excludes malformed output values', async () => {
    vi.spyOn(IntervalsClient.prototype, 'getRecentActivities').mockResolvedValue([
      { id: 'i42', moving_time: 'private-output-value' },
    ] as unknown as Awaited<ReturnType<IntervalsClient['getRecentActivities']>>);
    const request = await connect();
    const response = await request('tools/call', { name: 'list_recent_activities', arguments: {} });
    expect(response).toHaveProperty('result.isError', true);
    expect(JSON.stringify(response)).toContain('Output validation error');
    expect(JSON.stringify(response)).not.toContain('private-output-value');
    expect(response).not.toHaveProperty('result.structuredContent');
  });

  it('reports invalid upstream data without exposing its contents', async () => {
    mockHttp([{ name: 'private activity without id' }]);
    const request = await connect();
    expect(
      await request('tools/call', { name: 'list_recent_activities', arguments: {} }),
    ).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: 'API response does not match the expected schema.' }],
      },
    });
  });
});

describe('MCP full-resolution stream statistics', () => {
  it('uses all samples including a peak that the sampled stream tool could miss', async () => {
    mockHttp([
      { type: 'time', data: [0, 5, 10, 15] },
      { type: 'watts', data: [100, 1000, 100, 0] },
    ]);
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_activity_stream_statistics',
      arguments: {
        activityId: 'i42',
        types: ['watts'],
        zones: [{ type: 'watts', boundaries: [200] }],
      },
    });
    expect(response).toMatchObject({
      result: {
        structuredContent: {
          activityId: 'i42',
          totalPoints: 4,
          durationSeconds: 15,
          summaries: [
            {
              type: 'watts',
              weightedMean: 400,
              max: 1000,
              validSeconds: 15,
              coveragePercent: 100,
              zones: { boundaries: [200], seconds: [10, 5] },
            },
          ],
        },
      },
    });
  });

  it('applies default selections and accepts a focused time window', async () => {
    const adapter = mockHttp(activityStreams);
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_stream_statistics',
        arguments: { activityId: 'i42', startTime: 5, endTime: 10 },
      }),
    ).toHaveProperty('result.structuredContent.durationSeconds', 5);
    expect(adapter.mock.calls[0]![0].params.types).toBe(
      'time,heartrate,velocity_smooth,watts,cadence',
    );
  });

  it.each([
    { startTime: 20, endTime: 10 },
    { maxGapSeconds: 0 },
    { maxGapSeconds: 301 },
    { zones: [{ type: 'heartrate', boundaries: [150, 120] }] },
    { zones: [{ type: 'heartrate', boundaries: [120, 120] }] },
    { zones: [{ type: 'altitude', boundaries: [100] }] },
    {
      zones: [
        { type: 'heartrate', boundaries: [120] },
        { type: 'heartrate', boundaries: [150] },
      ],
    },
  ])('rejects invalid boundaries or options before HTTP %j', async (options) => {
    const adapter = mockHttp();
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_stream_statistics',
        arguments: { activityId: 'i42', ...options },
      }),
    ).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('sanitizes unavailable upstream data', async () => {
    mockHttp({ private: 'secret upstream body' });
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_activity_stream_statistics',
      arguments: { activityId: 'i42' },
    });
    expect(response).toHaveProperty('result.isError', true);
    expect(JSON.stringify(response)).not.toContain('secret upstream body');
  });
});

describe('MCP activity streams tool', () => {
  it('returns aligned measurements, units and missing-stream metadata without sampling short data', async () => {
    mockHttp(activityStreams);
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_activity_stream_overview',
      arguments: { activityId: 'i42' },
    });
    expect(response).toMatchObject({
      result: {
        structuredContent: {
          activityId: 'i42',
          time: [0, 5, 10, 16, 30, 60],
          streams: [
            { type: 'heartrate', unit: 'beats per minute', data: [120, 130, null, 150, 155, 140] },
            { type: 'velocity_smooth', unit: 'meters per second', data: [0, 2.5, 3, 3.5, 3, 0] },
            { type: 'cadence', data: [null, null, null, null, null, null] },
          ],
          missingStreams: ['watts', 'cadence'],
          totalPoints: 6,
          windowPoints: 6,
          returnedPoints: 6,
          sampled: false,
        },
      },
    });
    if ('result' in response) {
      const result = response.result as { structuredContent: unknown; content: { text: string }[] };
      expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    }
  });

  it('caps output and keeps the same sample indices across all streams and both endpoints', async () => {
    mockHttp(activityStreams);
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_stream_overview',
        arguments: { activityId: 'i42', types: ['heartrate', 'altitude'], maxPoints: 3 },
      }),
    ).toMatchObject({
      result: {
        structuredContent: {
          time: [0, 10, 60],
          streams: [{ data: [120, null, 140] }, { data: [-5, -3, 0] }],
          returnedPoints: 3,
          windowPoints: 6,
          sampled: true,
        },
      },
    });
  });

  it.each([
    [5, 30, [5, 10, 16, 30]],
    [61, undefined, []],
    [undefined, 0, [0]],
  ])('selects an inclusive time window %s to %s', async (startTime, endTime, expectedTime) => {
    mockHttp(activityStreams);
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_stream_overview',
        arguments: { activityId: 'i42', types: ['heartrate'], startTime, endTime },
      }),
    ).toHaveProperty('result.structuredContent.time', expectedTime);
  });

  it.each([
    { types: ['latlng'] },
    { types: [] },
    { maxPoints: 1 },
    { maxPoints: 501 },
    { maxPoints: 2.5 },
    { startTime: -1 },
    { startTime: 10, endTime: 5 },
  ])('rejects invalid selections and bounds %j before requesting', async (args) => {
    const adapter = mockHttp();
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_stream_overview',
        arguments: { activityId: 'i42', ...args },
      }),
    ).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('reports unavailable streams without leaking upstream data', async () => {
    mockHttp({ _note: 'private response details' });
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_activity_stream_overview',
      arguments: { activityId: 'i42' },
    });
    expect(response).toHaveProperty('result.isError', true);
    expect(JSON.stringify(response)).not.toContain('private response details');
  });
});

describe('MCP activity details tool', () => {
  it('returns session metrics and intervals as structured content and text', async () => {
    mockHttp(activityDetails);
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_details',
        arguments: { activityId: 'i42' },
      }),
    ).toMatchObject({
      result: {
        structuredContent: { activity: activityDetails },
        content: [{ type: 'text', text: JSON.stringify({ activity: activityDetails }) }],
      },
    });
  });

  it.each([
    {},
    { activityId: '' },
    { activityId: '../i42' },
    { activityId: 'i42?intervals=false' },
  ])('rejects invalid inputs before requesting', async (args) => {
    const adapter = mockHttp();
    const request = await connect();
    expect(
      await request('tools/call', { name: 'get_activity_details', arguments: args }),
    ).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('reports missing activities as sanitized HTTP errors', async () => {
    mockHttp('private activity contents', 404);
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_details',
        arguments: { activityId: 'i42' },
      }),
    ).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: 'HTTP request failed (HTTP 404).' }],
      },
    });
  });

  it('does not treat hidden activity stubs as usable session data', async () => {
    mockHttp({ id: 'i42', source: 'STRAVA', _note: 'private restriction details' });
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_activity_details',
      arguments: { activityId: 'i42' },
    });
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'API response does not match the expected schema.',
          },
        ],
      },
    });
    expect(JSON.stringify(response)).not.toContain('private restriction details');
  });
});

describe('MCP activity stream pages', () => {
  it('traverses a window without omissions and preserves aligned null values', async () => {
    mockHttp(activityStreams);
    const request = await connect();
    const times: number[] = [];
    const values: (number | null)[] = [];
    let offset: number | null = 0;
    do {
      const response = await request('tools/call', {
        name: 'get_activity_stream_page',
        arguments: {
          activityId: 'i42',
          types: ['heartrate'],
          startTime: 5,
          endTime: 30,
          pageSize: 3,
          offset,
        },
      });
      expect(response).not.toHaveProperty('result.isError', true);
      const page = (
        response as unknown as {
          result: {
            structuredContent: {
              time: number[];
              streams: { data: (number | null)[] }[];
              nextOffset: number | null;
              hasMore: boolean;
              windowPoints: number;
            };
          };
        }
      ).result.structuredContent;
      expect(page.windowPoints).toBe(4);
      expect(page.hasMore).toBe(page.nextOffset !== null);
      times.push(...page.time);
      values.push(...page.streams[0]!.data);
      offset = page.nextOffset;
    } while (offset !== null);
    expect(times).toEqual([5, 10, 16, 30]);
    expect(values).toEqual([130, null, 150, 155]);
  });

  it.each([{ offset: 6 }, { offset: 20 }, { startTime: 61 }])(
    'terminates empty pages %j',
    async (args) => {
      mockHttp(activityStreams);
      const request = await connect();
      expect(
        await request('tools/call', {
          name: 'get_activity_stream_page',
          arguments: { activityId: 'i42', ...args },
        }),
      ).toMatchObject({
        result: {
          structuredContent: { time: [], returnedPoints: 0, nextOffset: null, hasMore: false },
        },
      });
    },
  );

  it('defaults to 200 consecutive points and supports the 500-point maximum', async () => {
    mockHttp([{ type: 'time', data: Array.from({ length: 501 }, (_, i) => i) }]);
    const request = await connect();
    for (const pageSize of [undefined, 500]) {
      const count = pageSize ?? 200;
      expect(
        await request('tools/call', {
          name: 'get_activity_stream_page',
          arguments: { activityId: 'i42', types: ['watts'], pageSize },
        }),
      ).toMatchObject({
        result: {
          structuredContent: {
            time: Array.from({ length: count }, (_, i) => i),
            returnedPoints: count,
            nextOffset: count,
            missingStreams: ['watts'],
          },
        },
      });
    }
  });

  it.each([
    { offset: -1 },
    { offset: 0.5 },
    { pageSize: 0 },
    { pageSize: 501 },
    { startTime: 10, endTime: 5 },
  ])('rejects invalid pagination %j before fetching', async (args) => {
    const adapter = mockHttp();
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'get_activity_stream_page',
        arguments: { activityId: 'i42', ...args },
      }),
    ).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe('MCP athlete settings tool', () => {
  it('advertises a read-only settings tool', async () => {
    const adapter = mockHttp();
    const request = await connect();
    const response = await request('tools/list');
    if (!('result' in response)) throw new Error('Missing tool list');
    expect((response.result as { tools: unknown[] }).tools).toContainEqual(
      expect.objectContaining({
        name: 'get_athlete_settings',
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
    );
    expect(adapter).not.toHaveBeenCalled();
  });
  it('returns curated training settings with the JSON text fallback', async () => {
    const settings = {
      id: 'i12345',
      sportSettings: [
        { id: 1, types: ['Ride'], ftp: 250, power_zones: [55, 75, 90, 105, 120, 150, 999] },
      ],
    };
    mockHttp({ ...settings, icu_api_key: 'secret-account-key' });
    const request = await connect();
    const response = await request('tools/call', { name: 'get_athlete_settings', arguments: {} });
    expect(response).toMatchObject({
      result: {
        structuredContent: { settings },
        content: [{ type: 'text', text: JSON.stringify({ settings }) }],
      },
    });
    expect(JSON.stringify(response)).not.toContain('secret-account-key');
  });
  it.each([401, 403, 500])('sanitizes upstream HTTP %s', async (status) => {
    mockHttp({ private: 'secret upstream body' }, status);
    const request = await connect();
    const response = await request('tools/call', { name: 'get_athlete_settings', arguments: {} });
    expect(response).toHaveProperty('result.isError', true);
    expect(JSON.stringify(response)).not.toContain('secret');
  });
  it('sanitizes malformed settings', async () => {
    mockHttp({ icu_api_key: 'secret-account-key' });
    const request = await connect();
    const response = await request('tools/call', { name: 'get_athlete_settings', arguments: {} });
    expect(response).toHaveProperty('result.isError', true);
    expect(JSON.stringify(response)).not.toContain('secret-account-key');
  });
  it('returns original zone limits with an advisory warning instead of a tool error', async () => {
    mockHttp({
      id: 'i12345',
      timezone: 'Europe/Budapest',
      sportSettings: [{ id: 4, types: ['Rowing'], hr_zones: [184, 183] }],
    });
    const request = await connect();
    const response = await request('tools/call', { name: 'get_athlete_settings', arguments: {} });
    const output = {
      settings: {
        id: 'i12345',
        timezone: 'Europe/Budapest',
        sportSettings: [{ id: 4, types: ['Rowing'], hr_zones: [184, 183] }],
        zoneWarnings: [
          { sportSettingsId: 4, types: ['Rowing'], field: 'hr_zones', code: 'INVALID_ZONE_LIMITS' },
        ],
      },
    };
    expect(response).not.toHaveProperty('result.isError', true);
    expect(response).toMatchObject({
      result: {
        structuredContent: output,
        content: [{ type: 'text', text: JSON.stringify(output) }],
      },
    });
  });
});

describe.each([
  {
    name: 'list_activity_workload',
    field: 'activities',
    records: [{ id: 'i42', icu_training_load: 50, power_load: null }],
  },
  {
    name: 'list_wellness',
    field: 'wellness',
    records: [{ id: '2026-10-13', ctl: 40, atl: 55, fatigue: 0, hrv: null }],
  },
])('MCP $name', ({ name, field, records }) => {
  const dates = { oldest: '2026-10-01', newest: '2026-10-13' };
  it('returns structured records and equivalent text without unselected fields', async () => {
    mockHttp(
      records.map((record) => ({
        ...record,
        comments: 'private comments',
        customFields: { secret: 'private field' },
      })),
    );
    const request = await connect();
    const output = { ...dates, [field]: records };
    const response = await request('tools/call', { name, arguments: dates });
    expect(response).toMatchObject({
      result: {
        structuredContent: output,
        content: [{ type: 'text' }],
      },
    });
    if (!('result' in response)) throw new Error('Missing tool result');
    const result = response.result as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text)).toEqual(output);
    expect(JSON.stringify(response)).not.toContain('private');
  });
  it('returns empty records without inventing data', async () => {
    mockHttp([]);
    const request = await connect();
    expect(await request('tools/call', { name, arguments: dates })).toHaveProperty(
      `result.structuredContent.${field}`,
      [],
    );
  });
  it.each([
    {},
    { oldest: '2026-10-01' },
    { oldest: '2026-02-29', newest: '2026-03-01' },
    { oldest: '2026-10-13', newest: '2026-10-01' },
    { oldest: '2026-01-01', newest: '2026-04-01' },
    { oldest: '2024-01-01', newest: '2024-03-31' },
    { oldest: '2026-10-01T00:00:00', newest: '2026-10-13' },
  ])('rejects invalid dates before fetching %j', async (args) => {
    const adapter = mockHttp();
    const request = await connect();
    expect(await request('tools/call', { name, arguments: args })).toHaveProperty(
      'result.isError',
      true,
    );
    expect(adapter).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500])('sanitizes upstream HTTP %s', async (status) => {
    mockHttp({ private: 'secret upstream body' }, status);
    const request = await connect();
    const response = await request('tools/call', { name, arguments: dates });
    expect(response).toHaveProperty('result.isError', true);
    expect(JSON.stringify(response)).not.toContain('secret');
  });
  it('sanitizes malformed upstream records', async () => {
    mockHttp([{ private: 'secret response' }]);
    const request = await connect();
    const response = await request('tools/call', { name, arguments: dates });
    expect(response).toHaveProperty('result.isError', true);
    expect(JSON.stringify(response)).not.toContain('secret');
  });
});

describe('MCP planned workouts', () => {
  it('normalizes workout input defaults before invoking the application', async () => {
    const adapter = mockHttp();
    const request = await connect();
    const response = await request('tools/call', {
      name: 'preview_planned_workout',
      arguments: {
        workout: {
          name: '  Easy workout  ',
          sport: 'Run',
          startDateLocal: plannedWorkout.startDateLocal,
          steps: [{ name: '  Easy  ', duration: { type: 'time', seconds: 60 } }],
        },
      },
    });
    expect(response).toMatchObject({
      result: {
        structuredContent: {
          status: 'ready',
          timedSeconds: 60,
          totalDurationKnown: true,
          workout: {
            name: 'Easy workout',
            steps: [{ name: 'Easy', intensity: 'active', target: { type: 'open' } }],
          },
        },
      },
    });
    expect(response).not.toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });
  it('previews without a write and publishes the approved draft only once', async () => {
    const adapter = mockHttp(plannedEvent);
    const request = await connect();
    const preview = await request('tools/call', {
      name: 'preview_planned_workout',
      arguments: { workout: plannedWorkout },
    });
    expect(preview).toMatchObject({
      result: {
        structuredContent: {
          status: 'ready',
          workout: plannedWorkout,
          timedSeconds: 720,
          totalDurationKnown: false,
        },
      },
    });
    expect(adapter).not.toHaveBeenCalled();
    if (!('result' in preview)) throw new Error('Missing preview');
    const { draftId } = (preview.result as { structuredContent: { draftId: string } })
      .structuredContent;
    const args = { draftId, approved: true };
    const published = await request('tools/call', {
      name: 'publish_planned_workout',
      arguments: args,
    });
    expect(published).toMatchObject({
      result: { structuredContent: { draftId, event: plannedEvent } },
    });
    expect(
      await request('tools/call', { name: 'publish_planned_workout', arguments: args }),
    ).toMatchObject({ result: { structuredContent: { event: plannedEvent } } });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, false])('requires explicit approved=true, received %s', async (approved) => {
    const adapter = mockHttp(plannedEvent);
    const request = await connect();
    const response = await request('tools/call', {
      name: 'publish_planned_workout',
      arguments: { draftId: '00000000-0000-4000-8000-000000000000', approved },
    });
    expect(response).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });
  it('rejects unknown draft IDs without writing', async () => {
    const adapter = mockHttp(plannedEvent);
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'publish_planned_workout',
        arguments: { draftId: '00000000-0000-4000-8000-000000000000', approved: true },
      }),
    ).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Unknown draft; generate and review a preview in this server session first.',
          },
        ],
      },
    });
    expect(adapter).not.toHaveBeenCalled();
  });
  it('rejects unsupported preview steps before HTTP', async () => {
    const adapter = mockHttp();
    const request = await connect();
    expect(
      await request('tools/call', {
        name: 'preview_planned_workout',
        arguments: { workout: { ...plannedWorkout, steps: [] } },
      }),
    ).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });
  it('sanitizes uncertain outcomes and prevents retry writes', async () => {
    const adapter = mockHttp({ secret: 'upstream private data' }, 500);
    const request = await connect();
    const response = await request('tools/call', {
      name: 'preview_planned_workout',
      arguments: { workout: plannedWorkout },
    });
    if (!('result' in response)) throw new Error('Missing preview');
    const { draftId } = (response.result as { structuredContent: { draftId: string } })
      .structuredContent;
    for (let i = 0; i < 2; i++) {
      const published = await request('tools/call', {
        name: 'publish_planned_workout',
        arguments: { draftId, approved: true },
      });
      expect(published).toHaveProperty('result.isError', true);
      expect(JSON.stringify(published)).not.toContain('upstream private data');
      expect(JSON.stringify(published)).toContain('Inspect the Intervals calendar');
    }
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
