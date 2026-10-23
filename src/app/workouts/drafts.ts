import { parseWithError } from '../../validation.js';
import { WorkoutError, InputValidationError } from '../../errors.js';
import { createHash, randomUUID } from 'node:crypto';
import type { IntervalsClient } from '../../intervals/client.js';
import {
  plannedWorkoutSchema,
  type PlannedWorkout,
  type PlannedWorkoutInput,
  type WorkoutDraftStatus,
} from '../../schemas/workouts.js';
import type { PlannedWorkoutEvent } from '../../schemas/events.js';
import { encodeWorkoutFit } from './fit.js';

type Draft = {
  workout: PlannedWorkout;
  fit: Uint8Array;
  status: WorkoutDraftStatus;
  event?: PlannedWorkoutEvent;
};

/** One registry per MCP server, binding publication to the exact reviewed bytes. */
export class WorkoutDrafts {
  readonly #drafts = new Map<string, Draft>();
  readonly #byContent = new Map<string, string>();

  preview(input: PlannedWorkoutInput) {
    const workout = parseWithError(
      plannedWorkoutSchema,
      input,
      (cause) =>
        new InputValidationError(
          'Invalid workout. Check the supplied fields and supported values.',
          { cause },
        ),
    );
    const contentHash = createHash('sha256').update(JSON.stringify(workout)).digest('hex');
    let draftId = this.#byContent.get(contentHash);
    if (!draftId) {
      if (this.#drafts.size >= 100)
        throw new WorkoutError('Draft capacity reached; restart the server to create more drafts.');
      const fit = encodeWorkoutFit(workout);
      draftId = randomUUID();
      this.#drafts.set(draftId, { workout, fit, status: 'ready' });
      this.#byContent.set(contentHash, draftId);
    }
    const draft = this.#drafts.get(draftId)!;
    return {
      draftId,
      status: draft.status,
      workout: structuredClone(draft.workout),
      timedSeconds: workout.steps.reduce(
        (total, step) => total + (step.duration.type === 'time' ? step.duration.seconds : 0),
        0,
      ),
      distanceMeters: workout.steps.reduce(
        (total, step) => total + (step.duration.type === 'distance' ? step.duration.meters : 0),
        0,
      ),
      totalDurationKnown: workout.steps.every((step) => step.duration.type === 'time'),
      fit: {
        filename: 'workout.fit',
        bytes: draft.fit.length,
        sha256: createHash('sha256').update(draft.fit).digest('hex'),
      },
    };
  }

  async publish(draftId: string, client: IntervalsClient) {
    const draft = this.#drafts.get(draftId);
    if (!draft)
      throw new WorkoutError(
        'Unknown draft; generate and review a preview in this server session first.',
      );
    if (draft.status === 'published') return { draftId, event: draft.event! };
    if (draft.status === 'publishing')
      throw new WorkoutError(
        'Publication is in progress. Wait for its result before taking further action.',
      );
    if (draft.status === 'unknown')
      throw new WorkoutError(
        'Publication outcome is uncertain. Inspect the Intervals calendar before creating another draft.',
      );
    draft.status = 'publishing';
    try {
      const event = await client.publishPlannedWorkout(
        draft.workout,
        draft.fit,
        `intervals-mcp-${draftId}`,
      );
      draft.event = event;
      draft.status = 'published';
      return { draftId, event };
    } catch (error: unknown) {
      // A timeout or invalid response can occur after upstream creation; never retry blindly.
      draft.status = 'unknown';
      throw new WorkoutError(
        'Publication outcome is uncertain. Inspect the Intervals calendar before creating another draft.',
        { cause: error },
      );
    }
  }
}
