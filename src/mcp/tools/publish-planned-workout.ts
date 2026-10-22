import {
  publishPlannedWorkoutInputSchema,
  publishPlannedWorkoutOutputSchema,
} from '../../schemas/mcp/tools/publish-planned-workout.js';
import type { McpServer } from '@modelcontextprotocol/server';

import type { IntervalsClient } from '../../intervals/client.js';

import type { WorkoutDrafts } from '../../app/workouts/drafts.js';
import { toolResult } from '../result.js';

export function registerPublishPlannedWorkoutTool(
  server: McpServer,
  client: IntervalsClient,
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
    ({ draftId }) =>
      toolResult(
        async () => drafts.publish(draftId, client),
        'Unable to confirm workout publication. Use a reviewed draft from this session; if a write was attempted, inspect the Intervals calendar before retrying or creating another draft.',
      ),
  );
}
