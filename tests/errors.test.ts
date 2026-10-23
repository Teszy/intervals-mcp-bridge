import {
  AppError,
  HTTPError,
  UpstreamDataError,
  InputValidationError,
  WorkoutError,
} from '../src/errors.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolResult } from '../src/mcp/result.js';

describe('central error boundary', () => {
  it('preserves the exception type, inheritance and stack', () => {
    const error = new WorkoutError('Unknown draft; generate and review a preview first.');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(WorkoutError);
    expect(error.name).toBe('WorkoutError');
    expect(error.stack).toContain('WorkoutError');
  });

  it.each([
    new WorkoutError('Unknown draft; generate and review a preview first.'),
    new WorkoutError('Publication outcome is uncertain. Inspect the calendar first.'),
    new InputValidationError('Invalid input.'),
    new UpstreamDataError('Intervals API returned inconsistent data.'),
  ])('exposes controlled application messages', async (error) => {
    await expect(
      toolResult(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it.each([
    new Error('secret diagnostic'),
    'secret string',
    null,
    { name: 'AppError', message: 'secret' },
    z.string().safeParse(42).error,
  ])('hides untrusted and unexpected errors', async (error) => {
    const operation = toolResult(async () => {
      throw error;
    });
    await expect(operation).rejects.toThrow(
      'Unable to complete the operation due to an internal error.',
    );
    const sanitized: unknown = await operation.catch((caught: unknown) => caught);
    expect(sanitized).not.toBe(error);
    expect(sanitized).not.toHaveProperty('cause');
    expect(String(sanitized)).not.toContain('secret');
  });

  it('preserves upstream validation exceptions without wrapping them', async () => {
    const error = new UpstreamDataError('API response does not match the expected schema.');
    expect(error).toBeInstanceOf(UpstreamDataError);
    expect(error).not.toBeInstanceOf(HTTPError);
    await expect(
      toolResult(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(error.message).toBe('API response does not match the expected schema.');
  });

  it.each([
    new HTTPError(404),
    new HTTPError(429),
    new HTTPError(500),
    new HTTPError(401),
    new HTTPError(403),
  ])('handles HTTP exceptions through the same application boundary', async (error) => {
    expect(error).toBeInstanceOf(AppError);
    await expect(
      toolResult(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(error.message).toBe(`HTTP request failed (HTTP ${error.status}).`);
  });

  it('does not publish invalid HTTP statuses', () => {
    expect(new HTTPError(Number.NaN).message).toBe('HTTP request failed.');
  });

  it('preserves both successful representations', async () => {
    const output = { value: 42 };
    expect(await toolResult(async () => output)).toEqual({
      structuredContent: output,
      content: [{ type: 'text', text: JSON.stringify(output) }],
    });
  });
});
