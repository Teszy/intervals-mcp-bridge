import { activityStreamUnits, type ActivityStreams } from '../../schemas/streams.js';

/** Present validated streams using an inclusive elapsed-time window. */
export function createActivityStreamPage(
  data: ActivityStreams,
  {
    pageSize,
    offset,
    startTime,
    endTime,
  }: {
    pageSize: number;
    offset: number;
    startTime?: number | undefined;
    endTime?: number | undefined;
  },
) {
  const indices = data.time.flatMap((time, index) =>
    time >= (startTime ?? 0) && (endTime === undefined || time <= endTime) ? [index] : [],
  );
  const selected = indices.slice(offset, offset + pageSize);
  const hasMore = offset + selected.length < indices.length;
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
    offset,
    nextOffset: hasMore ? offset + selected.length : null,
    hasMore,
  };
}
