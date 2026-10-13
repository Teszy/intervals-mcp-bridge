import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { plannedWorkoutSchema } from '../../intervals/schemas.js';
import type { WorkoutDrafts } from '../../workouts/drafts.js';
import { toolResult } from '../result.js';

export function registerPreviewPlannedWorkoutTool(server: McpServer, drafts: WorkoutDrafts): void {
  server.registerTool(
    'preview_planned_workout',
    {
      title: 'Preview and validate planned workout',
      description:
        'Build and validate a FIT workout without writing to the calendar. Supports Run/Ride with 1–50 sequential steps, time in whole seconds or distance in whole meters, and open or absolute HR (bpm), power (watts), speed (m/s, 0.001 precision) target ranges. Expand repeated blocks into sequential steps. Resolve zones or relative targets into agreed absolute values using athlete settings; never invent thresholds. Convert pace seconds/km to speed as 1000/pace; faster pace is the higher speed bound. startDateLocal is athlete-local YYYY-MM-DDTHH:mm:ss without timezone suffix; use get_athlete_settings for timezone. Returns exact validated workout, draftId and FIT metadata. timedSeconds only sums time steps; distanceMeters only sums distance steps, so mixed workouts have no known total duration. Show the user the date, sport, all steps and targets and obtain explicit approval before calling publish_planned_workout with this draftId. Any change requires a new preview and approval. Drafts exist only in this server session, maximum 100 distinct drafts.',
      inputSchema: z.object({ workout: plannedWorkoutSchema }),
      outputSchema: z.object({
        draftId: z.uuid(),
        status: z.enum(['ready', 'publishing', 'published', 'unknown']),
        workout: plannedWorkoutSchema,
        timedSeconds: z.number().nonnegative(),
        distanceMeters: z.number().nonnegative(),
        totalDurationKnown: z.boolean(),
        fit: z.object({
          filename: z.string(),
          bytes: z.number().int().positive(),
          sha256: z.string(),
        }),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    ({ workout }) =>
      toolResult(
        async () => drafts.preview(workout),
        'Unable to generate a valid FIT workout preview. Check supported steps and targets; a session supports at most 100 distinct drafts.',
      ),
  );
}
