import { activityStreamUnits, type ActivityStreams } from '../../schemas/streams.js';

/** Present validated streams using an inclusive elapsed-time window. */
export function createActivityStreamOverview(
  data: ActivityStreams,
  {
    maxPoints,
    startTime,
    endTime,
  }: { maxPoints: number; startTime?: number | undefined; endTime?: number | undefined },
) {
  const indices = data.time.flatMap((time, index) =>
    time >= (startTime ?? 0) && (endTime === undefined || time <= endTime) ? [index] : [],
  );
  const sampled = indices.length > maxPoints;
  const selected = sampled
    ? Array.from(
        { length: maxPoints },
        (_, i) => indices[Math.floor((i * (indices.length - 1)) / (maxPoints - 1))]!,
      )
    : indices;
  return {
    time: selected.map((index) => data.time[index]!),
    streams: data.streams.map((stream) => ({
      type: stream.type,
      unit: activityStreamUnits[stream.type],
      data: selected.map((index) => stream.data[index]!),
    })),
    missingStreams: data.missingStreams,
    totalPoints: data.time.length,
    windowPoints: indices.length,
    returnedPoints: selected.length,
    sampled,
  };
}
