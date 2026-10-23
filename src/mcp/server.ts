import { WorkoutDrafts } from '../app/workouts/drafts.js';
import { registerPreviewPlannedWorkoutTool } from './tools/preview-planned-workout.js';
import { registerPublishPlannedWorkoutTool } from './tools/publish-planned-workout.js';
import { registerListActivityWorkloadTool } from './tools/list-activity-workload.js';
import { registerListWellnessTool } from './tools/list-wellness.js';
import { registerGetAthleteSettingsTool } from './tools/get-athlete-settings.js';
import { McpServer } from '@modelcontextprotocol/server';
import packageInfo from '../../package.json' with { type: 'json' };
import { IntervalsApi } from '../intervals/api.js';
import type { IntervalsConfig } from '../intervals/config.js';
import { registerGetActivityDetailsTool } from './tools/get-activity-details.js';
import { registerGetActivityStreamPageTool } from './tools/get-activity-stream-page.js';
import { registerGetActivityStreamOverviewTool } from './tools/get-activity-stream-overview.js';
import { registerGetActivityStreamStatisticsTool } from './tools/get-activity-stream-statistics.js';
import { registerListRecentActivitiesTool } from './tools/list-recent-activities.js';

/** Build the tool registry without opening a transport or making API requests. */
export function createServer(config: IntervalsConfig): McpServer {
  const server = new McpServer({ name: packageInfo.name, version: packageInfo.version });
  const client = new IntervalsApi(config);

  registerListRecentActivitiesTool(server, client);
  registerGetActivityDetailsTool(server, client);
  registerGetActivityStreamOverviewTool(server, client);
  registerGetActivityStreamPageTool(server, client);
  registerGetActivityStreamStatisticsTool(server, client);
  registerGetAthleteSettingsTool(server, client);
  registerListActivityWorkloadTool(server, client);
  registerListWellnessTool(server, client);
  const drafts = new WorkoutDrafts();

  registerPreviewPlannedWorkoutTool(server, drafts);
  registerPublishPlannedWorkoutTool(server, client, drafts);
  return server;
}
