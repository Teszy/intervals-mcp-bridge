import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const image = process.env.MCP_TEST_IMAGE;
const execFileAsync = promisify(execFile);
type ServerProcess = {
  child: ChildProcessWithoutNullStreams;
  containerName: string | undefined;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  readonly stdout: string;
  readonly stderr: string;
};
const children: ServerProcess[] = [];

function launch(env: NodeJS.ProcessEnv = {}): ServerProcess {
  const testEnv = {
    INTERVALS_API_KEY: 'test-key',
    INTERVALS_ATHLETE_ID: 'i12345',
    INTERVALS_BASE_URL: 'http://127.0.0.1:1',
    ...env,
  };
  const containerName = image ? `intervals-mcp-smoke-${randomUUID()}` : undefined;
  const command = image ? 'docker' : process.execPath;
  const args = image
    ? [
        'run',
        '--rm',
        '--interactive',
        '--pull',
        'never',
        '--network',
        'none',
        '--name',
        containerName!,
        '--entrypoint',
        'node',
        ...Object.entries(testEnv).flatMap(([key, value]) => ['--env', `${key}=${value ?? ''}`]),
        image,
        '/app/dist/src/index.js',
      ]
    : ['--import', 'tsx', entry];
  const child = spawn(command, args, {
    env: { ...process.env, ...testEnv },
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
    containerName,
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
  for (const { child, containerName } of children) {
    if (containerName) {
      // Only test-owned containers are removed, including after a failed assertion.
      await execFileAsync('docker', ['rm', '--force', containerName], { timeout: 5000 }).catch(
        () => {},
      );
    }
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
  await vi.waitFor(() => expect(server.stdout, server.stderr).toContain('"id":1'), {
    timeout: 5000,
  });
  const response = JSON.parse(server.stdout.trim().split('\n')[0]!);
  expect(response).toHaveProperty('result.serverInfo.name', 'intervals-mcp-bridge');
  server.child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
  );
}

describe(image ? 'Compiled Docker stdio entry point' : 'SDK source stdio entry point', () => {
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

  it('builds and validates a FIT preview through a real tool call', async () => {
    const server = launch();
    await initialize(server);
    server.child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'preview_planned_workout',
          arguments: {
            workout: {
              name: 'Smoke test',
              sport: 'Run',
              startDateLocal: '2030-01-02T08:00:00',
              steps: [{ name: 'Easy', duration: { type: 'time', seconds: 60 } }],
            },
          },
        },
      }) + '\n',
    );
    await vi.waitFor(() => expect(server.stdout, server.stderr).toContain('"id":2'), {
      timeout: 5000,
    });
    const response = server.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((message) => message.id === 2);
    expect(response).toMatchObject({
      result: {
        structuredContent: {
          status: 'ready',
          timedSeconds: 60,
          totalDurationKnown: true,
          fit: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
        },
      },
    });
    expect(response.result.structuredContent.fit.bytes).toBeGreaterThan(0);
    server.child.stdin.end();
    await expect(server.exited).resolves.toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'shuts down through the SDK handle on %s',
    async (signal) => {
      const server = launch();
      await initialize(server);
      if (server.containerName) {
        await execFileAsync('docker', ['kill', '--signal', signal, server.containerName]);
      } else {
        server.child.kill(signal);
      }
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
