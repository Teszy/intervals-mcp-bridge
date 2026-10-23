/** Base for expected failures whose messages are safe to expose to callers. */
export abstract class AppError extends Error {
  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class HTTPError extends AppError {
  constructor(
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(
      status === undefined
        ? 'HTTP request failed: network error or timeout.'
        : Number.isInteger(status) && status >= 100 && status <= 599
          ? `HTTP request failed (HTTP ${status}).`
          : 'HTTP request failed.',
      options,
    );
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class InputValidationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Use controlled messages, never upstream response bodies or library messages. */
export class UpstreamDataError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class WorkoutError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
