import { toolResult } from '../src/mcp/result.js';
import { WorkoutError } from '../src/errors.js';
import { Decoder, Stream } from '@garmin/fitsdk';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  plannedWorkoutSchema,
  type PlannedWorkout,
  type PlannedWorkoutInput,
} from '../src/schemas/workouts.js';
import { IntervalsApi } from '../src/intervals/api.js';
import { encodeWorkoutFit } from '../src/app/workouts/fit.js';
import { WorkoutDrafts } from '../src/app/workouts/drafts.js';
import { plannedWorkout, plannedEvent } from './fixtures/workout.js';
import { mockHttp } from './helpers/http.js';
const config = {
  apiKey: 'test-secret',
  athleteId: 'i12345',
  baseURL: 'https://intervals.icu/api/v1',
};
afterEach(() => vi.restoreAllMocks());

describe('FIT planned workouts', () => {
  it('requires a validated workout type for preview, FIT encoding and publication', () => {
    expectTypeOf<
      PlannedWorkoutInput extends PlannedWorkout ? true : false
    >().toEqualTypeOf<false>();
    expectTypeOf<Parameters<WorkoutDrafts['preview']>[0]>().toEqualTypeOf<PlannedWorkout>();
    expectTypeOf<Parameters<typeof encodeWorkoutFit>[0]>().toEqualTypeOf<PlannedWorkout>();
    expectTypeOf<
      Parameters<IntervalsApi['publishPlannedWorkout']>[0]
    >().toEqualTypeOf<PlannedWorkout>();
    expectTypeOf(plannedWorkoutSchema.parse(plannedWorkout)).toEqualTypeOf<PlannedWorkout>();
  });
  it('round-trips required messages, Unicode, time/distance scales and absolute targets with valid CRC', () => {
    const decoder = new Decoder(Stream.fromByteArray(encodeWorkoutFit(plannedWorkout)));
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toEqual([]);
    expect(messages.fileIdMesgs?.[0]).toMatchObject({
      type: 'workout',
      manufacturer: 'development',
    });
    expect(messages.workoutMesgs?.[0]).toMatchObject({
      sport: 'running',
      numValidSteps: 3,
      wktName: 'Test run',
    });
    expect(messages.workoutStepMesgs).toMatchObject([
      {
        messageIndex: 0,
        wktStepName: 'Warmup',
        intensity: 'warmup',
        durationTime: 600,
        customTargetValueLow: 220,
        customTargetValueHigh: 240,
      },
      {
        messageIndex: 1,
        durationDistance: 1000,
        targetType: 'speed',
        customTargetSpeedLow: 3.5,
        customTargetSpeedHigh: 4,
      },
      { messageIndex: 2, intensity: 'recovery', durationTime: 120, targetType: 'open' },
    ]);
  });
  it('encodes cycling and watt targets using the absolute-power offset', () => {
    const workout = {
      ...plannedWorkout,
      sport: 'Ride' as const,
      steps: [
        { ...plannedWorkout.steps[0]!, target: { type: 'power' as const, low: 200, high: 250 } },
      ],
    };
    const { messages } = new Decoder(
      Stream.fromByteArray(encodeWorkoutFit(plannedWorkoutSchema.parse(workout))),
    ).read();
    expect(messages.workoutMesgs?.[0]).toHaveProperty('sport', 'cycling');
    expect(messages.workoutStepMesgs?.[0]).toMatchObject({
      targetType: 'power',
      customTargetValueLow: 1200,
      customTargetValueHigh: 1250,
    });
  });
  it.each([
    { steps: [] },
    { sport: 'Swim' },
    { startDateLocal: '2026-10-14T09:00:00Z' },
    { startDateLocal: '2026-02-30T09:00:00' },
    { name: 'bad\0name' },
    { name: 'é'.repeat(51) },
    { steps: Array(51).fill(plannedWorkout.steps[0]) },
    { steps: [{ ...plannedWorkout.steps[0], duration: { type: 'time', seconds: 0 } }] },
    { steps: [{ ...plannedWorkout.steps[0], target: { type: 'heartRate', low: 150, high: 130 } }] },
    { steps: [{ ...plannedWorkout.steps[0], target: { type: 'power', low: 200.5, high: 250 } }] },
    { steps: [{ ...plannedWorkout.steps[0], target: { type: 'speed', low: 3.1234, high: 4 } }] },
  ])('rejects unsupported or invalid plans %j', (changes) => {
    expect(plannedWorkoutSchema.safeParse({ ...plannedWorkout, ...changes }).success).toBe(false);
  });
});

describe('workout draft publication', () => {
  it('owns a snapshot independent of later caller mutations', () => {
    const drafts = new WorkoutDrafts();
    const input = structuredClone(plannedWorkout);
    const preview = drafts.preview(input);
    input.name = 'Changed after preview';
    input.steps[0]!.name = 'Changed step';
    const repeated = drafts.preview(plannedWorkout);
    expect(repeated.draftId).toBe(preview.draftId);
    expect(repeated.workout).toEqual(plannedWorkout);
    expect(repeated.fit).toEqual(preview.fit);
  });
  it('uses a normalized workout for hashing, encoding and storing the reviewed workout', () => {
    const drafts = new WorkoutDrafts();
    const input = {
      ...plannedWorkout,
      name: '  Default targets  ',
      steps: [{ name: '  Easy  ', duration: { type: 'time' as const, seconds: 60 } }],
    };
    const preview = drafts.preview(plannedWorkoutSchema.parse(input));
    expect(preview.workout.name).toBe('Default targets');
    expect(preview.workout.steps).toEqual([
      {
        name: 'Easy',
        duration: { type: 'time', seconds: 60 },
        intensity: 'active',
        target: { type: 'open' },
      },
    ]);
    expect(drafts.preview(preview.workout).draftId).toBe(preview.draftId);
    const { messages, errors } = new Decoder(
      Stream.fromByteArray(encodeWorkoutFit(preview.workout)),
    ).read();
    expect(errors).toEqual([]);
    expect(messages.workoutStepMesgs?.[0]).toMatchObject({
      intensity: 'active',
      targetType: 'open',
      durationTime: 60,
    });
  });
  it('previews without HTTP and submits exact FIT bytes only once', async () => {
    const adapter = mockHttp({ ...plannedEvent, private: 'secret' });
    const drafts = new WorkoutDrafts();
    const preview = drafts.preview(plannedWorkout);
    expect(adapter).not.toHaveBeenCalled();
    expect(preview).toMatchObject({
      timedSeconds: 720,
      distanceMeters: 1000,
      totalDurationKnown: false,
      status: 'ready',
    });
    expect(drafts.preview(plannedWorkout).draftId).toBe(preview.draftId);
    // Mutating a returned preview must not alter the stored draft.
    preview.workout.name = 'Changed externally';
    const client = new IntervalsApi(config);
    expect(await drafts.publish(preview.draftId, client)).toEqual({
      draftId: preview.draftId,
      event: plannedEvent,
    });
    expect(await drafts.publish(preview.draftId, client)).toEqual({
      draftId: preview.draftId,
      event: plannedEvent,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    const request = adapter.mock.calls[0]![0];
    expect(request.url).toBe('/athlete/i12345/events?upsertOnUid=false');
    const body = JSON.parse(request.data as string);
    expect(body).toMatchObject({
      category: 'WORKOUT',
      type: 'Run',
      name: plannedWorkout.name,
      filename: 'workout.fit',
      start_date_local: plannedWorkout.startDateLocal,
      external_id: `intervals-mcp-${preview.draftId}`,
    });
    const bytes = Buffer.from(body.file_contents_base64, 'base64');
    expect(bytes.length).toBe(preview.fit.bytes);
    expect(new Decoder(Stream.fromByteArray(bytes)).checkIntegrity()).toBe(true);
    expect(drafts.preview(plannedWorkout).status).toBe('published');
  });
  it('requires a new draft after changes and reports known duration for time-only workouts', () => {
    const drafts = new WorkoutDrafts();
    const first = drafts.preview(plannedWorkout);
    const second = drafts.preview(
      plannedWorkoutSchema.parse({ ...plannedWorkout, steps: [plannedWorkout.steps[0]!] }),
    );
    expect(second.draftId).not.toBe(first.draftId);
    expect(second).toMatchObject({ timedSeconds: 600, totalDurationKnown: true });
  });
  it('rejects unknown or cross-session draft IDs before HTTP', async () => {
    const adapter = mockHttp(plannedEvent);
    const first = new WorkoutDrafts().preview(plannedWorkout);
    await expect(
      new WorkoutDrafts().publish(first.draftId, new IntervalsApi(config)),
    ).rejects.toThrow('Unknown draft');
    expect(adapter).not.toHaveBeenCalled();
  });
  it('blocks concurrent publications', async () => {
    const adapter = mockHttp(plannedEvent);
    let finish!: () => void;
    const original = adapter.getMockImplementation()!;
    adapter.mockImplementation(async (request) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return original(request);
    });
    const drafts = new WorkoutDrafts();
    const { draftId } = drafts.preview(plannedWorkout);
    const client = new IntervalsApi(config);
    const first = drafts.publish(draftId, client);
    await expect(drafts.publish(draftId, client)).rejects.toBeInstanceOf(WorkoutError);
    finish();
    await first;
    expect(adapter).toHaveBeenCalledTimes(1);
  });
  it.each([500, 200])('blocks retries when outcome is uncertain (HTTP %s)', async (status) => {
    const adapter = mockHttp({ private: 'secret' }, status);
    const drafts = new WorkoutDrafts();
    const { draftId } = drafts.preview(plannedWorkout);
    const client = new IntervalsApi(config);
    const publication = toolResult(async () => drafts.publish(draftId, client));
    await expect(publication).rejects.toThrow('uncertain');
    await expect(publication).rejects.toHaveProperty('cause');
    await expect(drafts.publish(draftId, client)).rejects.toThrow('uncertain');
    expect(drafts.preview(plannedWorkout).status).toBe('unknown');
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
