import { z } from 'zod';

export const workoutDraftStatusSchema = z.enum(['ready', 'publishing', 'published', 'unknown']);
export type WorkoutDraftStatus = z.infer<typeof workoutDraftStatusSchema>;

const fitTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (text) => !text.includes('\0') && Buffer.byteLength(text, 'utf8') <= 100,
    'FIT text must contain no NUL and fit within 100 UTF-8 bytes.',
  );
const workoutTargetSchema = z
  .discriminatedUnion('type', [
    z.strictObject({ type: z.literal('open') }),
    z.strictObject({
      type: z.literal('heartRate'),
      low: z.number().int().min(1).max(300),
      high: z.number().int().min(1).max(300),
    }),
    z.strictObject({
      type: z.literal('power'),
      low: z.number().int().min(1).max(3000),
      high: z.number().int().min(1).max(3000),
    }),
    z.strictObject({
      type: z.literal('speed'),
      low: z.number().positive().max(50).multipleOf(0.001),
      high: z.number().positive().max(50).multipleOf(0.001),
    }),
  ])
  .refine((target) => target.type === 'open' || target.high >= target.low, {
    message: 'Target high must be at least low.',
    path: ['high'],
  });

const plannedWorkoutStepSchema = z.strictObject({
  name: fitTextSchema,
  intensity: z.enum(['warmup', 'active', 'recovery', 'cooldown']).default('active'),
  duration: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('time'), seconds: z.number().int().min(1).max(86400) }),
    z.strictObject({ type: z.literal('distance'), meters: z.number().int().min(1).max(1000000) }),
  ]),
  target: workoutTargetSchema.default({ type: 'open' }),
});

export const plannedWorkoutSchema = z
  .strictObject({
    name: fitTextSchema,
    sport: z.enum(['Run', 'Ride']),
    startDateLocal: z.iso
      .datetime({ local: true, precision: 0 })
      .refine(
        (value) => !value.endsWith('Z'),
        'Use athlete-local YYYY-MM-DDTHH:mm:ss without a timezone suffix.',
      ),
    steps: z.array(plannedWorkoutStepSchema).min(1).max(50),
  })
  .brand<'PlannedWorkout'>();
export type PlannedWorkoutInput = z.input<typeof plannedWorkoutSchema>;
export type PlannedWorkout = z.output<typeof plannedWorkoutSchema>;
