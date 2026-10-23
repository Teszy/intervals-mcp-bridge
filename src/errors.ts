/** Base for expected failures whose messages are safe to expose to callers. */
export abstract class AppError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class HTTPError extends AppError {
  constructor(public readonly status?: number) {
    super(
      status === undefined
        ? 'HTTP request failed: network error or timeout.'
        : Number.isInteger(status) && status >= 100 && status <= 599
          ? `HTTP request failed (HTTP ${status}).`
          : 'HTTP request failed.',
    );
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message);
  }
}

export class InputValidationError extends AppError {
  constructor(message: string) {
    super(message);
  }
}

/** Use controlled messages, never upstream response bodies or library messages. */
export class UpstreamDataError extends AppError {
  constructor(message: string) {
    super(message);
  }
}

export class WorkoutError extends AppError {
  constructor(message: string) {
    super(message);
  }
}
