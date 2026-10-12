/** Synthetic, irregularly timed samples with a sensor gap and negative altitude. */
export const activityStreams = [
  { type: 'time', data: [0, 5, 10, 16, 30, 60] },
  { type: 'heartrate', data: [120, 130, null, 150, 155, 140] },
  { type: 'velocity_smooth', data: [0, 2.5, 3, 3.5, 3, 0] },
  { type: 'cadence', data: [null, null, null, null, null, null] },
  { type: 'altitude', data: [-5, -4, -3, -2, -1, 0] },
];
