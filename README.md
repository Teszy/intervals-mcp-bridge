# intervals-mcp-bridge

[![CI & Release](https://github.com/Teszy/intervals-mcp-bridge/actions/workflows/release.yml/badge.svg?branch=main&event=push)](https://github.com/Teszy/intervals-mcp-bridge/actions/workflows/release.yml)
[![Container publish](https://github.com/Teszy/intervals-mcp-bridge/actions/workflows/publish-image.yml/badge.svg?event=release)](https://github.com/Teszy/intervals-mcp-bridge/actions/workflows/publish-image.yml)
[![Latest release](https://img.shields.io/github/v/release/Teszy/intervals-mcp-bridge)](https://github.com/Teszy/intervals-mcp-bridge/releases/latest)

MCP server that gives ChatGPT access to Intervals.icu training
data and lets them publish approved planned workouts.

## Setup

Requires Git and Docker with Compose support. Clone the repository, copy
`.env.example` to `.env` in the repository root, and fill in the settings below.

### Obtain Intervals.icu key and ID

Fill in the Intervals.icu values in `.env`: obtain your personal API key from
Intervals.icu **Settings > Developer Settings** and set your athlete ID.

In your local `.env`:

```dotenv
INTERVALS_API_KEY=your_intervals_api_key
INTERVALS_ATHLETE_ID=i123456
```

### OpenAI tunnel

In [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels),
create a tunnel and associate it with the Platform organization and ChatGPT
account/workspace you will use. Copy its full `tunnel_…` ID.

In your local `.env`:

```dotenv
OPENAI_TUNNEL_ID=tunnel_REPLACE_WITH_YOUR_ID
```

### Obtain OpenAI runtime key

Create a runtime API key in [OpenAI Platform API keys](https://platform.openai.com/settings/organization/api-keys)
for that organization. Tunnel creation requires **Tunnels Read + Manage**;
runtime use and selecting the tunnel in ChatGPT require **Tunnels Read + Use**.
See the [official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
for permissions and account associations.

In your local `.env`:

```dotenv
OPENAI_TUNNEL_API_KEY=your_openai_tunnel_runtime_api_key
```

Credentials stay in your local `.env` and are supplied at runtime.
**They are never included in the published image.**

## Run

Start Docker before running the commands below.

### Start the container

From the cloned repository root containing `compose.yaml` and `.env`, run:

```sh
docker compose pull
docker compose up -d
```

This downloads the published Docker Compose prebuilt image from [GitHub Packages](https://github.com/users/Teszy/packages/container/package/intervals-mcp-bridge) and starts the service in the background. Wait for the container to become **healthy**. No local build, Node.js or pnpm installation is needed.

The image bundles the compiled MCP bridge, Node.js and the OpenAI tunnel client
for Linux amd64 and arm64, including Apple Silicon.

### Update or stop

To update, repeat the `pull` and `up -d` commands:

```sh
docker compose pull
docker compose up -d
```

To stop the service:

```sh
docker compose down
```

### Add the MCP server to ChatGPT

In ChatGPT, open **Plugins**, select **+**, then **Add custom MCP server**.
Enter a name, such as **Intervals**, choose **Tunnel** under Connection and select
your tunnel. Choose **No authentication** for this server; the tunnel handles
access and the MCP server uses your local Intervals credentials.

Select **Create as a plugin**, then install the
resulting plugin in your personal or intended workspace. Custom MCP access also
depends on workspace permissions and security restrictions. See
[OpenAI's connection guide](https://developers.openai.com/api/docs/guides/custom-mcp-server)
for the current interface and access requirements.

### Select the plugin and verify a tool call

Open a conversation in the same ChatGPT account/workspace, type `@` and select
your installed **Intervals** plugin. For example, ask:

> Use Intervals to list my completed activities from the past two weeks.

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

Workout publication
creates a calendar workout; existing events are not updated or deleted.

## Session lifetime

ChatGPT tools are unavailable while the container is stopped or the computer is
asleep. Local development tools are available while the host's MCP process runs.

> [!WARNING]
> Workout drafts and published-event results are held in memory., limited to 100 distinct drafts per server session,
> including published ones.

At the limit, restart the container to create new drafts; unpublished drafts will be lost. This limitation is planned for future improvement.

Previously published calendar events remain in Intervals. If a write had an uncertain outcome, inspect the calendar before creating a new draft.

## Development

> [!NOTE]
> Direct local execution requires only the Intervals settings in `.env`.
> The `OPENAI_` variables and an OpenAI tunnel are not needed.

Clone the repository and create `.env` from `.env.example` in its root.
Install dependencies from the repository root:

```sh
pnpm install
```

Build the server:

```sh
pnpm build
```

Run the MCP server directly through an MCP host.

### Using VS Code and Copilot as MCP host

> [!NOTE]
> Requires VS Code 1.140 or later. Copilot Free is sufficient.

Create a file named `.mcp.json` in the repository root with the following content:

```json
{
  "mcpServers": {
    "intervals-mcp-bridge": {
      "type": "stdio",
      "command": "node",
      "args": ["--env-file=/absolute/path/to/.env", "/absolute/path/to/dist/src/index.js"],
      "tools": ["*"]
    }
  }
}
```

Replace both example paths with absolute paths to your local checkout. The `.mcp.json` file is ignored by Git by default because it contains
machine-specific paths; each developer creates their own local copy.

Start the MCP using VS Code's MCP controls.
Ask Copilot for your recent activities to verify the connection.

After source
changes, rebuild and restart the server. VS Code manages the process over stdio.

See [ARCHITECTURE.md](ARCHITECTURE.md) for component responsibilities, data flow,
state management and verification strategy.

### CI/CD

- **GitHub Actions:** [PR quality gates](.github/workflows/pr-qgate.yml),
  [main validation and releases](.github/workflows/release.yml), and
  [Docker image publishing](.github/workflows/publish-image.yml).
- **Release Please:** release PRs, versioning, changelog and GitHub releases.
- **Husky and lint-staged:** staged-file formatting/linting, type checks and tests before commits.
- **commitlint:** Conventional Commits enforcement.
