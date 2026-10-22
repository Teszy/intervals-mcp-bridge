import type { z } from 'zod';
import axios, { AxiosHeaders, type AxiosInstance } from 'axios';
import { APIResponseValidationError, Forbidden, HTTPError, Unauthorized } from './errors.js';
import type { Auth, QueryParams } from './types.js';

/** Axios based framework-independent ES module for public and authenticated HTTP requests. */
export class APIClient {
  readonly #baseURL: string;
  readonly #auth: Auth | undefined;

  constructor(baseURL: string, auth?: Auth) {
    this.#baseURL = baseURL;
    this.#auth = auth ? { ...auth } : undefined;
  }

  async get<S extends z.ZodType>(
    endpoint: string,
    schema: S,
    params?: QueryParams,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    const dataResult = await this.#request(async (client) => {
      const response = await client.get<unknown>(endpoint, {
        params,
        signal: signal ?? AbortSignal.timeout(15_000),
      });
      return response.data;
    });
    return this.#validate(dataResult, schema);
  }

  async post<S extends z.ZodType>(
    endpoint: string,
    schema: S,
    data?: unknown,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    const dataResult = await this.#request(async (client) => {
      const response = await client.post<unknown>(endpoint, data, {
        signal: signal ?? AbortSignal.timeout(15_000),
      });
      return response.data;
    });
    return this.#validate(dataResult, schema);
  }

  async uploadFile<S extends z.ZodType>(
    endpoint: string,
    schema: S,
    formData: FormData,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    // Axios supplies multipart headers, including the boundary, for FormData.
    return this.post(endpoint, schema, formData, signal);
  }

  #validate<S extends z.ZodType>(data: unknown, schema: S): z.output<S> {
    const result = schema.safeParse(data);
    if (!result.success) throw new APIResponseValidationError(result.error.issues);
    return result.data;
  }

  #createClient(): AxiosInstance {
    const headers = new AxiosHeaders({ Accept: 'application/json' });
    if (this.#auth?.type === 'bearer' && this.#auth.token) {
      headers.set('Authorization', `Bearer ${this.#auth.token}`);
    } else if (this.#auth?.type === 'basic') {
      const credentials = Buffer.from(`${this.#auth.username}:${this.#auth.password}`).toString(
        'base64',
      );
      headers.set('Authorization', `Basic ${credentials}`);
    }
    return axios.create({
      baseURL: this.#baseURL,
      headers,
      timeout: 15_000,
      maxRedirects: 0,
    });
  }

  async #request<T>(request: (client: AxiosInstance) => Promise<T>): Promise<T> {
    try {
      return await request(this.#createClient());
    } catch (error: unknown) {
      // Axios errors contain credentials and response bodies; omit the original cause.
      throw this.#handleError(error);
    }
  }

  #handleError(error: unknown): HTTPError {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401) return new Unauthorized();
    if (status === 403) return new Forbidden();
    return status === undefined
      ? new HTTPError()
      : new HTTPError(`HTTP request failed (HTTP ${status}).`, status);
  }
}
