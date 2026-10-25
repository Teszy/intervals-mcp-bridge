# intervals-mcp-bridge

MCP server that gives ChatGPT access to Intervals.icu training
data and lets them publish approved planned workouts.

## Setup

Create a local `.env` file from [.env.example](.env.example) in the repository root.

### Obtain Intervals.icu key and ID

Fill in the Intervals.icu values in `.env`: obtain your personal API key from
Intervals.icu **Settings > Developer Settings** and set your athlete ID.

In the repository's `.env`:

```dotenv
INTERVALS_API_KEY=your_intervals_api_key
INTERVALS_ATHLETE_ID=i123456
```

### OpenAI tunnel

In [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels),
create a tunnel and associate it with the Platform organization and ChatGPT
account/workspace you will use. Copy its full `tunnel_…` ID.

In the repository's `.env`:

```dotenv
OPENAI_TUNNEL_ID=tunnel_REPLACE_WITH_YOUR_ID
```

### Obtain OpenAI runtime key

Create a runtime API key in [OpenAI Platform API keys](https://platform.openai.com/settings/organization/api-keys)
for that organization. Tunnel creation requires **Tunnels Read + Manage**;
runtime use and selecting the tunnel in ChatGPT require **Tunnels Read + Use**.
See the [official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
for permissions and account associations.

In the repository's `.env`:

```dotenv
OPENAI_TUNNEL_API_KEY=your_openai_tunnel_runtime_api_key
```

## Run

Docker is the recommended runtime. The image includes the compiled MCP bridge,
Node.js and the OpenAI tunnel client.

Install and start Docker Desktop (or Docker Engine with Compose support).

### Build and start the container

From the repository root, run:

```sh
pnpm docker:up
```

This runs `docker compose up --build -d`: it builds the image and starts the
service in the background. In Docker Desktop, wait for the container to become
**healthy** before connecting ChatGPT.

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

Workout drafts and published-event results are held in process memory. Restarting or recreating the server loses them, so complete preview and publication in the same running process. Previously published calendar events remain in Intervals.
If a write had an uncertain outcome, inspect the calendar before creating a new draft.

## Development

> [!NOTE]
> Direct local execution requires only the Intervals settings in `.env`.
> The `OPENAI_` variables and an OpenAI tunnel are not needed.

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

- **GitHub Actions:** [PR quality gates](.github/workflows/pr-qgate.yml) and
  [main validation and releases](.github/workflows/release.yml).
- **Release Please:** release PRs, versioning, changelog and GitHub releases.
- **Husky and lint-staged:** staged-file formatting/linting, type checks and tests before commits.
- **commitlint:** Conventional Commits enforcement.

CI also builds the Docker runtime image and runs the stdio tests against its
compiled application. Run the same container smoke check locally with Docker running:

```sh
docker build --tag intervals-mcp-bridge:ci-smoke .
pnpm test:container
```

The tests start temporary containers with dummy credentials and networking disabled.
They invoke the Node entry point directly; tunnel connectivity is a separate check.
