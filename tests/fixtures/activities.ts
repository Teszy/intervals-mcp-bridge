import type { ActivityDetails } from '../../src/intervals/schemas.js';

/** Synthetic running session shared by domain and MCP tests. */
export const activityDetails = {
  id: 'i42',
  name: 'Morning intervals',
  type: 'Run',
  start_date_local: '2026-01-02T08:00:00',
  distance: 5000,
  moving_time: 1800,
  elapsed_time: 1900,
  average_speed: 2.78,
  average_heartrate: 145,
  max_heartrate: 170,
  icu_average_watts: null,
  icu_training_load: 40,
  stream_types: ['time', 'heartrate', 'velocity_smooth'],
  icu_intervals: [
    {
      id: 1,
      type: 'WORK',
      start_time: 600,
      end_time: 900,
      distance: 1000,
      moving_time: 300,
      average_speed: 3.33,
      average_heartrate: 165,
    },
  ],
} satisfies ActivityDetails;
