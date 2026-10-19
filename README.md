# intervals-mcp-bridge

A local MCP server that gives Copilot and ChatGPT access to Intervals.icu training
data and lets them publish approved planned workouts.

## Setup

Use Node.js 24 and the pnpm version pinned in [package.json](package.json).
Open this repository, then install dependencies and
create your local environment file:

```bash
pnpm install
cp .env.example .env
```

Set `INTERVALS_API_KEY` in `.env` to your personal API key from Intervals.icu
Settings > Developer Settings. Set `INTERVALS_ATHLETE_ID` to your athlete ID. See [.env.example](.env.example)
for the configuration.

Create `.vscode/mcp.json` with the following configuration:

```json
{
  "servers": {
    "intervals": {
      "type": "stdio",
      "command": "node",
      "args": ["--env-file=${workspaceFolder}/.env", "${workspaceFolder}/dist/src/index.js"]
    }
  }
}
```

This configuration loads `.env` and runs the compiled server from your workspace.

## Start with VS Code and Copilot

Build the server before starting it:

```bash
pnpm build
```

Open `.vscode/mcp.json` and start the `intervals` server using
VS Code's MCP controls. Copilot can then call its tools. For example, ask it to
list your activities from the past week to verify the connection to Intervals.icu.

After changing the source, run `pnpm build` again and restart the server in VS Code.
VS Code manages the server process and communicates with it over stdio.

## Use with ChatGPT

ChatGPT can use the same local server through OpenAI Secure MCP Tunnel.
Follow the [tunnel setup guide](docs/secure-mcp-tunnel.md), then select the Intervals
plugin with `@` in a ChatGPT conversation. Keep the tunnel client running while
using the tools.

Activity reading, athlete settings, workout preview, approved publication and repeat
publication without duplicate creation have been manually verified through ChatGPT.

## What the server can do

| Tool                             | Purpose                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `list_recent_activities`         | Find recent completed activities to select a session for analysis.                               |
| `get_activity_details`           | Read a session's metrics and detected work/recovery intervals.                                   |
| `get_activity_stream_overview`   | Get a sampled overview of heart rate, speed, power and other measurements.                       |
| `get_activity_stream_page`       | Inspect original measurement points in pages without sampling.                                   |
| `get_activity_stream_statistics` | Calculate stream statistics, data coverage and time in supplied zones from full-resolution data. |
| `get_athlete_settings`           | Read current sport profiles, training thresholds and zones.                                      |
| `list_activity_workload`         | Compare recorded session loads over a date range.                                                |
| `list_wellness`                  | Read daily recovery observations and Intervals fitness/fatigue values.                           |
| `preview_planned_workout`        | Validate a running or cycling workout and prepare a FIT draft for review.                        |
| `publish_planned_workout`        | Publish the exact reviewed draft to the Intervals calendar after explicit user approval.         |

Data-reading tools use the configured athlete's Intervals data. Workout publication
creates a calendar workout; existing events are not updated or deleted.

See [ARCHITECTURE.md](ARCHITECTURE.md) for component responsibilities, data flow,
state management and verification strategy.

## CI/CD

- [QGate Verification](.github/workflows/pr-qgate.yml) validates pull requests.
- [Release Engine](.github/workflows/release.yml) validates pushes to `main`, then
  uses Release Please to prepare release PRs or publish merged releases.

Workflow files define the automated checks. Commit hooks format and lint staged
files and run type checks and tests. Script definitions live in
[package.json](package.json).

Use Conventional Commits: commitlint enforces the format, and Release Please uses
the commit history to update the version and changelog.
