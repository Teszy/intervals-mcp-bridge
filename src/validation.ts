import type { z } from 'zod';

/** Translates validation failures; exceptions thrown by schema code propagate unchanged. */
export function parseWithError<S extends z.ZodType>(
  schema: S,
  input: unknown,
  createError: (cause: z.ZodError) => Error,
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw createError(result.error);
  return result.data;
}
