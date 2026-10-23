import { AppError } from '../errors.js';

/** Keep successful result formatting and sanitized errors consistent across tools. */
export async function toolResult<T extends Record<string, unknown>>(operation: () => Promise<T>) {
  try {
    const output = await operation();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      structuredContent: output,
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    // eslint-disable-next-line preserve-caught-error -- The public error must not retain sensitive library errors as its cause.
    throw new Error('Unable to complete the operation due to an internal error.');
  }
}
