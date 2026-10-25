import { z } from 'zod';
import { plannedWorkoutEventSchema } from '../../schemas/events.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsApi } from '../../intervals/api.js';

import type { WorkoutDrafts } from '../../app/workouts/drafts.js';
import { toolHandler } from '../tool-handler.js';

const publishPlannedWorkoutInputSchema = z.strictObject({
  draftId: z.uuid(),
  approved: z.literal(true),
});

const publishPlannedWorkoutOutputSchema = z.object({
  draftId: z.uuid(),
  event: plannedWorkoutEventSchema,
});

export function registerPublishPlannedWorkoutTool(
  server: McpServer,
  client: IntervalsApi,
  drafts: WorkoutDrafts,
): void {
  server.registerTool(
    'publish_planned_workout',
    {
      title: 'Publish approved workout to calendar',
      description:
        'Create one planned Intervals calendar WORKOUT by uploading the exact FIT bytes from preview_planned_workout. This writes to the configured athlete calendar. Call only after presenting the full preview and obtaining the user explicit approval for that exact draft and date; set approved=true only then. Any workout change requires a new preview and approval. Requires a draftId from this server session. Repeating a successful publication returns the stored event without another write. Concurrent or uncertain attempts are blocked. If publication fails, check the Intervals calendar before creating another draft or restarting; a timeout can occur after the event was created. Existing events are not updated or deleted. Device synchronization depends on the athlete Intervals configuration.',
      inputSchema: publishPlannedWorkoutInputSchema,
      outputSchema: publishPlannedWorkoutOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    toolHandler(async ({ draftId }, ctx) => drafts.publish(draftId, client, ctx.mcpReq.signal)),
  );
}
