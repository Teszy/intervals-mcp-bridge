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
            name: 'get_recent_activities',
            inputSchema: { properties: { days: { minimum: 1, maximum: 365, default: 7 } } },
            outputSchema: { properties: { activities: { type: 'array' } } },
            annotations: { readOnlyHint: true },
          },
          {
            name: 'get_activity',
            inputSchema: { required: ['activityId'] },
            outputSchema: { properties: { activity: { type: 'object' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: 'get_activity_streams',
            inputSchema: {
              required: ['activityId'],
              properties: { maxPoints: { minimum: 2, maximum: 500, default: 200 } },
            },
            outputSchema: { properties: { time: { type: 'array' }, sampled: { type: 'boolean' } } },
            annotations: { readOnlyHint: true, destructiveHint: false },
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
        name: 'get_recent_activities',
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
    const response = await request('tools/call', { name: 'get_recent_activities', arguments: {} });
    expect(response).toHaveProperty('result.structuredContent.activities', []);
    expect(response).not.toHaveProperty('result.isError', true);
  });

  it.each([0, 366, 1.5, '7'])('rejects invalid days %s before requesting', async (days) => {
    const adapter = mockHttp();
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_recent_activities',
      arguments: { days },
    });
    expect(response).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500])('reports HTTP %s as a sanitized tool error', async (status) => {
    mockHttp('test-secret response body', status);
    const request = await connect();
    const response = await request('tools/call', { name: 'get_recent_activities', arguments: {} });
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: `HTTP request failed (HTTP ${status}).` }],
      },
    });
    expect(JSON.stringify(response)).not.toContain('test-secret');
  });

  it('reports invalid upstream data without exposing its contents', async () => {
    mockHttp([{ name: 'private activity without id' }]);
    const request = await connect();
    expect(
      await request('tools/call', { name: 'get_recent_activities', arguments: {} }),
    ).toMatchObject({
      result: {
        isError: true,
        content: [{ type: 'text', text: 'Unable to retrieve valid Intervals activities.' }],
      },
    });
  });
});

describe('MCP activity streams tool', () => {
  it('returns aligned measurements, units and missing-stream metadata without sampling short data', async () => {
    mockHttp(activityStreams);
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_activity_streams',
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
        name: 'get_activity_streams',
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
        name: 'get_activity_streams',
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
        name: 'get_activity_streams',
        arguments: { activityId: 'i42', ...args },
      }),
    ).toHaveProperty('result.isError', true);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('reports unavailable streams without leaking upstream data', async () => {
    mockHttp({ _note: 'private response details' });
    const request = await connect();
    const response = await request('tools/call', {
      name: 'get_activity_streams',
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
      await request('tools/call', { name: 'get_activity', arguments: { activityId: 'i42' } }),
    ).toMatchObject({
      result: {
        structuredContent: { activity: activityDetails },
        content: [{ type: 'text', text: JSON.stringify({ activity: activityDetails }) }],
      },
    });
  });

  it.each([{}, { activityId: '../i42' }])(
    'rejects invalid inputs before requesting',
    async (args) => {
      const adapter = mockHttp();
      const request = await connect();
      expect(await request('tools/call', { name: 'get_activity', arguments: args })).toHaveProperty(
        'result.isError',
        true,
      );
      expect(adapter).not.toHaveBeenCalled();
    },
  );

  it('reports missing activities as sanitized HTTP errors', async () => {
    mockHttp('private activity contents', 404);
    const request = await connect();
    expect(
      await request('tools/call', { name: 'get_activity', arguments: { activityId: 'i42' } }),
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
      name: 'get_activity',
      arguments: { activityId: 'i42' },
    });
    expect(response).toMatchObject({
      result: {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Unable to retrieve valid activity details. The activity may be unavailable through the Intervals API.',
          },
        ],
      },
    });
    expect(JSON.stringify(response)).not.toContain('private restriction details');
  });
});
