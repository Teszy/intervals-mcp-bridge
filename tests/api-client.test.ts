import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { APIClient } from '../src/api/client.js';
import type { BasicAuth, BearerAuth } from '../src/api/types.js';
import {
  APIResponseValidationError,
  Forbidden,
  HTTPError,
  Unauthorized,
} from '../src/api/errors.js';
import { mockHttp } from './helpers/http.js';

function setup(data: unknown = { ok: true }, status = 200, authToken?: string) {
  const adapter = mockHttp(data, status);
  const client = new APIClient(
    'https://api.example.com/v1',
    authToken === undefined ? undefined : { type: 'bearer', token: authToken },
  );
  return { client, adapter };
}

afterEach(() => vi.restoreAllMocks());

describe('APIClient', () => {
  it('requests public endpoints with query parameters and returns response data', async () => {
    const { client, adapter } = setup();
    expect(await client.get('/public', z.unknown(), { page: 1, active: true })).toEqual({
      ok: true,
    });
    const request = adapter.mock.calls[0]![0];
    expect(request).toMatchObject({
      baseURL: 'https://api.example.com/v1',
      url: '/public',
      method: 'get',
      params: { page: 1, active: true },
      timeout: 15_000,
      maxRedirects: 0,
    });
    expect(request.headers.get('Accept')).toBe('application/json');
    expect(request.headers.has('Authorization')).toBe(false);
  });

  it('adds Bearer authentication while retaining other headers', async () => {
    const { client, adapter } = setup([], 200, 'secret-token');
    await client.get('/protected', z.unknown());
    const headers = adapter.mock.calls[0]![0].headers;
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('encodes Basic credentials and copies them at construction', async () => {
    const { adapter } = setup();
    const auth: BasicAuth = { type: 'basic', username: 'API_KEY', password: 'secret-key' };
    const client = new APIClient('https://api.example.com', auth);
    auth.password = 'changed';
    await client.get('', z.unknown());
    const headers = adapter.mock.calls[0]![0].headers;
    expect(headers.get('Authorization')).toBe(
      'Basic ' + Buffer.from('API_KEY:secret-key').toString('base64'),
    );
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('copies Bearer credentials at construction', async () => {
    const { adapter } = setup();
    const auth: BearerAuth = { type: 'bearer', token: 'original' };
    const client = new APIClient('https://api.example.com', auth);
    auth.token = 'changed';
    await client.get('', z.unknown());
    expect(adapter.mock.calls[0]![0].headers.get('Authorization')).toBe('Bearer original');
  });

  it('posts JSON and returns only the response data', async () => {
    const { client, adapter } = setup({ id: 1 });
    expect(await client.post('/items', z.unknown(), { name: 'item' })).toEqual({ id: 1 });
    const request = adapter.mock.calls[0]![0];
    expect(request.method).toBe('post');
    expect(JSON.parse(request.data as string)).toEqual({ name: 'item' });
    expect(request.headers.get('Content-Type')).toBe('application/json');
  });

  it('uploads FormData without hardcoding a multipart boundary', async () => {
    const { client, adapter } = setup({ uploaded: true });
    const form = new FormData();
    form.append('file', new Blob(['sample']), 'sample.txt');
    expect(await client.uploadFile('/files', z.unknown(), form)).toEqual({ uploaded: true });
    const request = adapter.mock.calls[0]![0];
    expect(request.method).toBe('post');
    expect(request.data).toBe(form);
    const create = vi.spyOn(axios, 'create');
    await client.uploadFile('/files', z.unknown(), form);
    expect(create.mock.calls[0]![0]?.headers).not.toHaveProperty('Content-Type');
  });

  it('creates one Axios instance for each get, post, and uploadFile call', async () => {
    const create = vi.spyOn(axios, 'create');
    const { client } = setup();
    expect(create).not.toHaveBeenCalled();
    await client.get('', z.unknown());
    await client.post('', z.unknown());
    await client.uploadFile('/files', z.unknown(), new FormData());
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('supports default options and endpoint arguments', async () => {
    const { adapter } = setup();
    const client = new APIClient('https://api.example.com');
    await client.get('', z.unknown());
    await client.post('', z.unknown());
    expect(adapter.mock.calls.map(([request]) => request.url)).toEqual(['', '']);
  });

  it('treats an empty token as a public request', async () => {
    const { client, adapter } = setup([], 200, '');
    await client.get('', z.unknown());
    expect(adapter.mock.calls[0]![0].headers.has('Authorization')).toBe(false);
  });

  it('passes caller cancellation signals through all methods', async () => {
    const { client, adapter } = setup();
    const controller = new AbortController();
    await client.get('/items', z.unknown(), undefined, controller.signal);
    await client.post('/items', z.unknown(), {}, controller.signal);
    await client.uploadFile('/files', z.unknown(), new FormData(), controller.signal);
    for (const [request] of adapter.mock.calls) expect(request.signal).toBe(controller.signal);
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
    const request = client.get('', z.unknown());
    expect(timeout).toHaveBeenCalledWith(15_000);
    controller.abort();
    await expect(request).rejects.toThrow('network error or timeout');
  });

  it('parses JSON response bodies', async () => {
    const { client } = setup('[{"id":"i1"}]');
    expect(await client.get('', z.unknown())).toEqual([{ id: 'i1' }]);
  });

  it('maps cancellation to HTTPError', async () => {
    const { client, adapter } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.get('/items', z.unknown(), undefined, controller.signal),
    ).rejects.toBeInstanceOf(HTTPError);
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each([
    [302, HTTPError],
    [401, Unauthorized],
    [403, Forbidden],
    [429, HTTPError],
    [500, HTTPError],
  ] as const)('maps HTTP %s to a typed Error subclass', async (status, ErrorType) => {
    const { client } = setup('secret response body', status, 'secret-token');
    await expect(client.get('', z.unknown())).rejects.toBeInstanceOf(ErrorType);
    const error: unknown = await client.post('', z.unknown()).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      status,
      message: `HTTP request failed (HTTP ${status}).`,
    });
    expect(error).not.toHaveProperty('config');
    expect(error).not.toHaveProperty('response');
    expect(error).not.toHaveProperty('cause');
    expect(String(error)).not.toContain('secret');
  });

  it.each([
    new Error('secret-token'),
    new AxiosError('secret-token', 'ERR_NETWORK'),
    new AxiosError('secret-token', 'ECONNABORTED'),
  ])('sanitizes network and unexpected errors', async (error) => {
    const { client, adapter } = setup();
    adapter.mockRejectedValue(error);
    await expect(client.uploadFile('/files', z.unknown(), new FormData())).rejects.toMatchObject({
      name: 'HTTPError',
      message: 'HTTP request failed: network error or timeout.',
    });
  });
});

describe('API response validation', () => {
  it('infers transformed output types and strips unselected fields', async () => {
    const { client } = setup({ count: '42', secret: 'private' });
    const schema = z.object({ count: z.string().transform(Number) });
    const result = await client.get('/items', schema);
    expectTypeOf(result).toEqualTypeOf<{ count: number }>();
    expect(result).toEqual({ count: 42 });
  });

  it.each(['get', 'post', 'uploadFile'] as const)(
    'validates %s responses without mapping schema failures to HTTP errors',
    async (method) => {
      const { client } = setup({ count: 'secret response body' });
      const schema = z.object({ count: z.number() });
      const operation =
        method === 'get'
          ? client.get('/items', schema)
          : method === 'post'
            ? client.post('/items', schema, {})
            : client.uploadFile('/files', schema, new FormData());
      const error: unknown = await operation.catch((error: unknown) => error);
      expect(error).toBeInstanceOf(APIResponseValidationError);
      expect(error).not.toBeInstanceOf(HTTPError);
      expect(error).toMatchObject({
        name: 'APIResponseValidationError',
        issues: [{ code: 'invalid_type', path: ['count'] }],
      });
      expect(error).not.toHaveProperty('cause');
      expect(error).not.toHaveProperty('response');
      expect(JSON.stringify(error)).not.toContain('secret');
      expect(String(error)).not.toContain('secret');
    },
  );

  it('keeps validation messages and input metadata out of diagnostics', async () => {
    const { client } = setup('secret value');
    const schema = z.string().refine(() => false, 'private diagnostic');
    const error: unknown = await client.get('/items', schema).catch((error: unknown) => error);
    expect(error).toMatchObject({ issues: [{ code: 'custom', path: [] }] });
    expect(JSON.stringify(error)).not.toContain('private');
    expect(JSON.stringify(error)).not.toContain('secret');
  });

  it('keeps transport failures distinct even with a response schema', async () => {
    const { client } = setup({ count: 'invalid' }, 403);
    await expect(client.get('/items', z.object({ count: z.number() }))).rejects.toBeInstanceOf(
      Forbidden,
    );
  });
});
