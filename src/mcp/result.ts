import { HTTPError } from '../api/errors.js';

/** Keep successful result formatting and sanitized errors consistent across tools. */
export async function toolResult<T extends Record<string, unknown>>(
  operation: () => Promise<T>,
  errorMessage: string,
) {
  try {
    const output = await operation();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      structuredContent: output,
    };
  } catch (error: unknown) {
    const message = error instanceof HTTPError ? error.message : errorMessage;
    return { isError: true, content: [{ type: 'text' as const, text: message }] };
  }
}
