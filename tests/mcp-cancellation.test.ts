import { InMemoryTransport, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/mcp/server.js';
import { plannedWorkout } from './fixtures/workout.js';
import { mockHttp } from './helpers/http.js';

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
  const [client, transport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (message: JSONRPCMessage) => void>();
  let nextId = 0;
  client.onmessage = (message) => {
    if ('id' in message && typeof message.id === 'number') {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  };
  function request(method: string, params: Record<string, unknown> = {}) {
    const id = ++nextId;
    const response = new Promise<JSONRPCMessage>((resolve) => pending.set(id, resolve));
    const sent = client.send({ jsonrpc: '2.0', id, method, params });
    return { id, response: sent.then(() => response) };
  }
  await server.connect(transport);
  await client.start();
  await request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'cancellation-test', version: '1' },
  }).response;
  await client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return {
    server,
    request,
    cancel: (requestId: number) =>
      client.send({
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId, reason: 'cancelled by caller' },
      }),
  };
}

/** Keep the request pending until the real Axios cancellation signal fires. */
function stalledHttp() {
  const adapter = mockHttp();
  const aborted = vi.fn();
  adapter.mockImplementation(
    (request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener?.(
          'abort',
          () => {
            aborted();
            reject(new AxiosError('cancelled', 'ERR_CANCELED'));
          },
          { once: true },
        );
      }),
  );
  return { adapter, aborted };
}

const dates = { oldest: '2026-10-01', newest: '2026-10-02' };

describe('MCP request cancellation', () => {
  it.each([
    { name: 'list_recent_activities', args: {} },
    { name: 'get_activity_details', args: { activityId: 'i42' } },
    { name: 'get_athlete_settings', args: {} },
    { name: 'list_activity_workload', args: dates },
    { name: 'list_wellness', args: dates },
    { name: 'get_activity_stream_overview', args: { activityId: 'i42' } },
    { name: 'get_activity_stream_page', args: { activityId: 'i42' } },
    { name: 'get_activity_stream_statistics', args: { activityId: 'i42' } },
  ])('cancels the upstream request for $name', async ({ name, args }) => {
    const { adapter, aborted } = stalledHttp();
    const session = await connect();
    const { id } = session.request('tools/call', { name, arguments: args });
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));

    await session.cancel(id);

    await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
    expect(adapter.mock.calls[0]![0].signal?.aborted).toBe(true);
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight HTTP request when the MCP server closes', async () => {
    const { adapter, aborted } = stalledHttp();
    const session = await connect();
    session.request('tools/call', { name: 'list_recent_activities', arguments: {} });
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));

    await session.server.close();

    await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
  });

  it('does not cancel another concurrent request', async () => {
    const { adapter, aborted } = stalledHttp();
    const session = await connect();
    const first = session.request('tools/call', { name: 'list_recent_activities', arguments: {} });
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    const second = session.request('tools/call', { name: 'get_athlete_settings', arguments: {} });
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));

    await session.cancel(first.id);

    await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
    expect(adapter.mock.calls[0]![0].signal?.aborted).toBe(true);
    expect(adapter.mock.calls[1]![0].signal?.aborted).toBe(false);
    await session.cancel(second.id);
    await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(2));
  });

  it('keeps an in-flight cancelled publication uncertain and blocks another write', async () => {
    const { adapter, aborted } = stalledHttp();
    const session = await connect();
    const preview = await session.request('tools/call', {
      name: 'preview_planned_workout',
      arguments: { workout: plannedWorkout },
    }).response;
    if (!('result' in preview)) throw new Error('Missing preview result');
    const { draftId } = (preview.result as { structuredContent: { draftId: string } })
      .structuredContent;
    const publication = { name: 'publish_planned_workout', arguments: { draftId, approved: true } };
    const { id } = session.request('tools/call', publication);
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));

    await session.cancel(id);

    await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
    await vi.waitFor(async () => {
      expect(
        await session.request('tools/call', {
          name: 'preview_planned_workout',
          arguments: { workout: plannedWorkout },
        }).response,
      ).toHaveProperty('result.structuredContent.status', 'unknown');
    });
    const retry = await session.request('tools/call', publication).response;
    expect(retry).toHaveProperty('result.isError', true);
    expect(JSON.stringify(retry)).toContain('Publication outcome is uncertain');
    expect(JSON.stringify(retry)).not.toContain('test-secret');
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
