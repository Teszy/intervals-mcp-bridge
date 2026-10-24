import { AppError } from '../errors.js';

/** Apply shared MCP result formatting and error handling to a tool operation. */
export function toolHandler<Args extends unknown[], T extends Record<string, unknown>>(
  operation: (...args: Args) => T | Promise<T>,
) {
  return async (...args: Args) => {
    try {
      const output = await operation(...args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      throw new Error('Unable to complete the operation due to an internal error.', {
        cause: error,
      });
    }
  };
}
