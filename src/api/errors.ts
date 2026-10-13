import type { z } from 'zod';

export class HTTPError extends Error {
  constructor(
    message = 'HTTP request failed: network error or timeout.',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'HTTPError';
  }
}

export class Unauthorized extends HTTPError {
  constructor() {
    super('HTTP request failed (HTTP 401).', 401);
    this.name = 'Unauthorized';
  }
}

export class Forbidden extends HTTPError {
  constructor() {
    super('HTTP request failed (HTTP 403).', 403);
    this.name = 'Forbidden';
  }
}

/** Response contract failure; retains no raw response or error cause. */
export class APIResponseValidationError extends Error {
  readonly issues: ReadonlyArray<Pick<z.core.$ZodIssue, 'code' | 'path'>>;
  constructor(issues: readonly z.core.$ZodIssue[]) {
    super('API response does not match the expected schema.');
    this.name = 'APIResponseValidationError';
    // Messages and metadata can contain input values or custom secrets.
    this.issues = issues.map(({ code, path }) => ({ code, path: [...path] }));
  }
}
