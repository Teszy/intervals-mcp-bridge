import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { vi } from 'vitest';

const createAxiosClient = axios.create.bind(axios);

/** Stub only transport, retaining Axios request/response transformations. Restore mocks after each test. */
export function mockHttp(data: unknown = [], status = 200) {
  const adapter = vi.fn<AxiosAdapter>().mockImplementation(async (config) => {
    const response: AxiosResponse<unknown> = { data, status, statusText: '', headers: {}, config };
    // Custom adapters must reject unsuccessful responses themselves.
    if (status < 200 || status >= 300) {
      throw new AxiosError('secret response body', 'ERR_BAD_RESPONSE', config, undefined, response);
    }
    return response;
  });
  vi.spyOn(axios, 'create').mockImplementation((options) =>
    createAxiosClient({ ...options, adapter }),
  );
  return adapter;
}
