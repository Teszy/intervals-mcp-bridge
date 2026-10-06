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
