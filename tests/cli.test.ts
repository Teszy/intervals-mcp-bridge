import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IntervalsClient } from '../src/intervals/client.js';

vi.mock('../src/intervals/client.js', () => ({ IntervalsClient: vi.fn() }));

const getRecentActivities = vi.fn();
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  process.argv = ['node', 'src/cli.ts'];
  process.exitCode = 0;
  getRecentActivities.mockReset().mockResolvedValue([]);
  vi.mocked(IntervalsClient).mockImplementation(function () {
    return { getRecentActivities } as unknown as IntervalsClient;
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'table').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('fetches seven days by default and accepts empty results', async () => {
  await import('../src/cli.js');
  expect(getRecentActivities).toHaveBeenCalledWith(7);
  expect(console.log).toHaveBeenCalledWith('Found 0 activities in the last 7 days.');
  expect(process.exitCode).toBe(0);
});

it('fetches the requested period and displays activities', async () => {
  process.argv.push('30');
  getRecentActivities.mockResolvedValue([{ id: 'i123' }]);
  await import('../src/cli.js');
  expect(getRecentActivities).toHaveBeenCalledWith(30);
  expect(console.table).toHaveBeenCalledWith([{ id: 'i123' }]);
});

it('shows help without creating a client', async () => {
  process.argv.push('--help');
  await import('../src/cli.js');
  expect(IntervalsClient).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
});

it.each([['0'], ['366'], ['abc'], ['1', '2']])('rejects invalid arguments %j', async (...args) => {
  process.argv.push(...args);
  await import('../src/cli.js');
  expect(IntervalsClient).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it('reports a client failure with an unsuccessful exit code', async () => {
  getRecentActivities.mockRejectedValue(new Error('HTTP request failed (HTTP 401).'));
  await import('../src/cli.js');
  expect(console.error).toHaveBeenCalledWith('HTTP request failed (HTTP 401).');
  expect(process.exitCode).toBe(1);
});
