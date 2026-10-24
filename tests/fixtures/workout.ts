import { plannedWorkoutSchema } from '../../src/schemas/workouts.js';
export const plannedWorkout = plannedWorkoutSchema.parse({
  name: 'Test run',
  sport: 'Run',
  startDateLocal: '2026-10-14T09:00:00',
  steps: [
    {
      name: 'Warmup',
      intensity: 'warmup',
      duration: { type: 'time', seconds: 600 },
      target: { type: 'heartRate', low: 120, high: 140 },
    },
    {
      name: 'Interval',
      intensity: 'active',
      duration: { type: 'distance', meters: 1000 },
      target: { type: 'speed', low: 3.5, high: 4 },
    },
    {
      name: 'Recovery',
      intensity: 'recovery',
      duration: { type: 'time', seconds: 120 },
      target: { type: 'open' },
    },
  ],
});
export const plannedEvent = {
  id: 42,
  category: 'WORKOUT' as const,
  type: 'Run',
  name: 'Test run',
  start_date_local: plannedWorkout.startDateLocal,
};
