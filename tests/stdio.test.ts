import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startStdioServer } from '../src/mcp/stdio.js';

const originalExitCode = process.exitCode;
const handles: ReturnType<typeof startStdioServer>[] = [];
afterEach(async () => {
  await Promise.allSettled(handles.splice(0).map((h) => h.close()));
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('stdio lifecycle errors', () => {
  it.each([false, true])(
    'closes the transport and sets failure status for deferred factory failures (async=%s)',
    async (asyncFailure) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const [client, transport] = InMemoryTransport.createLinkedPair();
      const closed = vi.spyOn(transport, 'close');
      const failure = new TypeError('secret registration details');
      const handle = startStdioServer(() => {
        if (asyncFailure) return Promise.reject(failure);
        throw failure;
      }, transport);
      handles.push(handle);
      await client.start();
      await client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      });
      await vi.waitFor(() => expect(closed).toHaveBeenCalled());
      expect(process.exitCode).toBe(1);
      expect(log.mock.calls).toHaveLength(1);
      expect(log).toHaveBeenCalledWith('Unable to initialize MCP server.');
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
      const closeCount = closed.mock.calls.length;
      await handle.close();
      expect(closed).toHaveBeenCalledTimes(closeCount);
    },
  );

  it.each([false, true])(
    'fails and closes when transport startup throws (async=%s)',
    async (asyncFailure) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const [, transport] = InMemoryTransport.createLinkedPair();
      const failure = new Error('secret startup details');
      vi.spyOn(transport, 'start').mockImplementation(() => {
        if (asyncFailure) return Promise.reject(failure);
        throw failure;
      });
      const closed = vi.spyOn(transport, 'close');
      const factory = vi.fn(() => new McpServer({ name: 'test', version: '1' }));
      const handle = startStdioServer(factory, transport);
      handles.push(handle);
      await vi.waitFor(() => expect(closed).toHaveBeenCalled());
      await handle.close();
      expect(process.exitCode).toBe(1);
      expect(factory).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('Unable to start MCP transport.');
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    },
  );

  it('rejects close and sets a failing exit status even when the SDK absorbs the transport rejection', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [, transport] = InMemoryTransport.createLinkedPair();
    const failure = new Error('secret close details');
    const closed = vi.spyOn(transport, 'close').mockRejectedValue(failure);
    const handle = startStdioServer(() => new McpServer({ name: 'test', version: '1' }), transport);
    handles.push(handle);
    const closing = handle.close();
    await expect(closing).rejects.toThrow('Unable to close MCP transport.');
    await expect(closing).rejects.toHaveProperty('cause', failure);
    expect(handle.close()).toBe(closing);
    expect(process.exitCode).toBe(1);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  });

  it('closes successfully without changing exit status', async () => {
    const [, transport] = InMemoryTransport.createLinkedPair();
    const handle = startStdioServer(() => new McpServer({ name: 'test', version: '1' }), transport);
    handles.push(handle);
    await expect(handle.close()).resolves.toBeUndefined();
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('reports transport errors without treating them as fatal construction failures', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [, transport] = InMemoryTransport.createLinkedPair();
    const closed = vi.spyOn(transport, 'close');
    const handle = startStdioServer(() => new McpServer({ name: 'test', version: '1' }), transport);
    handles.push(handle);
    transport.onerror?.(new Error('secret transport details'));
    expect(closed).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(originalExitCode);
    expect(log).toHaveBeenCalledWith('MCP transport error.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  });
});
