import { InMemoryTransport, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageInfo from '../package.json' with { type: 'json' };
import { createServer } from '../src/mcp/server.js';
import { mockHttp } from './helpers/http.js';
import { activityDetails } from './fixtures/activities.js';

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
