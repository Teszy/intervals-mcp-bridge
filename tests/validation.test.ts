import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import { InputValidationError, UpstreamDataError } from '../src/errors.js';
import { parseWithError } from '../src/validation.js';

describe('parseWithError', () => {
  it('returns normalized output with defaults, stripping and inferred types', () => {
    const schema = z.object({ count: z.string().transform(Number).default(7) });
    const createError = vi.fn(
      (cause: z.ZodError) => new InputValidationError('Invalid input.', { cause }),
    );
    const output = parseWithError(schema, { extra: 'discard' }, createError);
    expectTypeOf(output).toEqualTypeOf<{ count: number }>();
    expect(output).toEqual({ count: 7 });
    expect(parseWithError(schema, { count: '42' }, createError)).toEqual({ count: 42 });
    expect(createError).not.toHaveBeenCalled();
  });

  it.each([InputValidationError, UpstreamDataError])(
    'preserves the contextual error and original validation cause',
    (ErrorType) => {
      const createError = vi.fn(
        (cause: z.ZodError) => new ErrorType('Controlled message.', { cause }),
      );
      let caught: unknown;
      try {
        parseWithError(z.number(), 'invalid', createError);
      } catch (error: unknown) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ErrorType);
      expect(createError).toHaveBeenCalledTimes(1);
      const cause = createError.mock.calls[0]![0];
      expect(cause).toBeInstanceOf(z.ZodError);
      expect(caught).toHaveProperty('cause', cause);
      expect(caught).toHaveProperty('cause.stack', cause.stack);
    },
  );

  it('does not turn exceptions in schema code into validation failures', () => {
    const failure = new TypeError('Unexpected transform failure');
    const schema = z.string().transform(() => {
      throw failure;
    });
    const createError = vi.fn(
      (cause: z.ZodError) => new InputValidationError('Invalid input.', { cause }),
    );
    let caught: unknown;
    try {
      parseWithError(schema, 'valid input', createError);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(createError).not.toHaveBeenCalled();
  });
});
