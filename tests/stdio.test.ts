import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
type ServerProcess = {
  child: ChildProcessWithoutNullStreams;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  readonly stdout: string;
  readonly stderr: string;
};
const children: ServerProcess[] = [];

function launch(env: NodeJS.ProcessEnv = {}): ServerProcess {
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    env: {
      ...process.env,
      INTERVALS_API_KEY: 'test-key',
      INTERVALS_ATHLETE_ID: 'i12345',
      INTERVALS_BASE_URL: 'https://intervals.icu/api/v1',
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    },
  );
  const server = {
    child,
    exited,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
  children.push(server);
  return server;
}

afterEach(async () => {
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await Promise.all(children.splice(0).map((server) => server.exited));
});

async function initialize(server: ReturnType<typeof launch>) {
  server.child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'stdio-test', version: '1' },
      },
    }) + '\n',
  );
  await vi.waitFor(() => expect(server.stdout).toContain('"id":1'), { timeout: 5000 });
  const response = JSON.parse(server.stdout.trim().split('\n')[0]!);
  expect(response).toHaveProperty('result.serverInfo.name', 'intervals-mcp-bridge');
  server.child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
  );
}

describe('SDK stdio entry point', () => {
  it('serves real stdio requests and exits cleanly on EOF', async () => {
    const server = launch();
    await initialize(server);
    server.child.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n',
    );
    await vi.waitFor(() => expect(server.stdout).toContain('"id":2'), { timeout: 5000 });
    const responses = server.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(responses.find((response) => response.id === 2)).toHaveProperty('result.tools');
    server.child.stdin.end();
    await expect(server.exited).resolves.toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'shuts down through the SDK handle on %s',
    async (signal) => {
      const server = launch();
      await initialize(server);
      server.child.kill(signal);
      await expect(server.exited).resolves.toEqual({ code: 0, signal: null });
      expect(server.stderr).toBe('');
    },
  );

  it('rejects invalid configuration without writing non-protocol output to stdout', async () => {
    const server = launch({ INTERVALS_API_KEY: '' });
    await expect(server.exited).resolves.toEqual({ code: 1, signal: null });
    expect(server.stdout).toBe('');
    expect(server.stderr).toContain('Invalid Intervals configuration');
    expect(server.stderr).not.toContain('test-key');
  });
});
