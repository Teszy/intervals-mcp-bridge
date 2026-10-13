# intervals-mcp-bridge

A lightweight MCP bridge for Intervals.icu training data, with a local stdio server
and an activity CLI.

## Setup

Use Node.js 24 and the pnpm version pinned in `package.json`.

```bash
pnpm install
cp .env.example .env
```

Set your personal API key and athlete ID in `.env`, following the comments in
[.env.example](.env.example). The CLI and server commands load this file automatically.

## Commands

| Command                  | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `pnpm mcp`               | Start the stdio MCP server from TypeScript                        |
| `pnpm start`             | Start the compiled MCP server after `pnpm build`                  |
| `pnpm dev`               | Restart the server when source files change                       |
| `pnpm activities`        | Fetch activities from the last 7 days                             |
| `pnpm activities 30`     | Fetch activities from the last 30 days                            |
| `pnpm activities --help` | Show CLI usage                                                    |
| `pnpm test`              | Run tests in watch mode                                           |
| `pnpm test:run`          | Run tests once                                                    |
| `pnpm check`             | Run formatting, lint, type checks, tests with coverage, and build |
| `pnpm format`            | Format the project                                                |
| `pnpm build`             | Compile TypeScript to `dist/`                                     |

Tests use mocked HTTP responses and require no API credentials.

## Connect an MCP host

Run `pnpm build`, then configure your host to launch Node directly. For hosts using
an `mcpServers` configuration:

```json
{
  "mcpServers": {
    "intervals": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/intervals-mcp-bridge/.env",
        "/absolute/path/intervals-mcp-bridge/dist/src/index.js"
      ]
    }
  }
}
```

Replace the paths with your checkout location. The server exposes
`list_recent_activities` with optional `days` (1–365; default 7). It waits for MCP
messages; use `pnpm activities` for a terminal table.
Use `get_activity_details` with an ID from that list to retrieve session metrics and
detected work/recovery intervals. `get_activity_stream_overview` retrieves heart rate,
speed, power, cadence, distance, or altitude over elapsed time. It returns up to
200 samples by default (maximum 500); optional time bounds let you inspect an
interval more closely. Missing measurements remain unavailable, and sampled
results are marked explicitly.
`get_activity_stream_page` returns consecutive original points without sampling
(default pageSize 200, maximum 500). Start with offset 0 and continue using nextOffset
until it is null. Keep the activity, streams and inclusive time bounds unchanged.
Offsets count points within the window. Each call fetches current upstream data;
editing an activity during traversal can shift pages.
The former names `get_activity` and `get_activity_streams` are now
`get_activity_details` and `get_activity_stream_overview`; update saved tool calls.
`get_activity_stream_statistics` calculates duration-weighted means, observed extrema,
and coverage from full-resolution streams. It supports time windows and explicit
zone boundaries; missing readings and long recording gaps are excluded from averages.

## Links

- [Architecture and extension guide](ARCHITECTURE.md)

- [Intervals.icu API reference](https://intervals.icu/api-docs.html)
- [API access and personal API keys](https://forum.intervals.icu/t/api-access-to-intervals-icu/609)
- [API integration cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090)
- [OAuth setup](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Contributing

Use [Conventional Commits](https://www.conventionalcommits.org/), enforced by
commitlint. Husky and lint-staged format and lint staged files before committing,
then run `pnpm check:commit` (type checks and tests).

## CI/CD

GitHub Actions runs two workflows:

- [QGate Verification](.github/workflows/pr-qgate.yml) checks PRs, including release
  PRs. Its **Quality Gates** check is required before merging.
- [Release Engine](.github/workflows/release.yml) validates pushes to `main`, then
  runs Release Please to prepare a release PR or publish a merged release.

Both use `pnpm check`: Prettier formatting, ESLint, TypeScript type checks,
Vitest tests with coverage, and a build. Run it locally to reproduce validation;
use `pnpm format` to fix formatting. Scripts are defined in [package.json](package.json).

[Release Please](https://github.com/googleapis/release-please-action) uses
Conventional Commits to update `package.json` and generate `CHANGELOG.md` in a PR.
Merging that PR publishes the Git tag and GitHub Release after validation.
The generated changelog is excluded from Prettier checks; the MCP server reads
its version from `package.json`.

## Example LLM tool calls

These are example MCP `tools/call` parameters. `i42` is a placeholder: the LLM
uses an actual activity ID returned by `list_recent_activities`.

- “Find my runs from the past week.” List activities, then select the relevant sport:
  `{"name":"list_recent_activities","arguments":{"days":7}}`.
- “Show the session metrics and work/recovery intervals for that run.”
  `{"name":"get_activity_details","arguments":{"activityId":"i42"}}`.
- “Give me an overview of heart rate and speed over the run.”
  `{"name":"get_activity_stream_overview","arguments":{"activityId":"i42","types":["heartrate","velocity_smooth"],"maxPoints":200}}`.
  The LLM checks `sampled`; sampled points can miss peaks and short efforts.
- “Inspect every heart-rate reading between minutes 10 and 20.”
  `{"name":"get_activity_stream_page","arguments":{"activityId":"i42","types":["heartrate"],"startTime":600,"endTime":1200,"pageSize":200,"offset":0}}`.
  If the response gives `nextOffset: 200`, repeat with `offset: 200` and the same
  other arguments. Continue using each returned `nextOffset` until it is null.
- “Calculate average and maximum heart rate between minutes 10 and 20, and time
  in zones using my supplied boundaries of 130, 150 and 170 bpm.”
  `{"name":"get_activity_stream_statistics","arguments":{"activityId":"i42","types":["heartrate"],"startTime":600,"endTime":1200,"zones":[{"type":"heartrate","boundaries":[130,150,170]}]}}`.
  The LLM reports the duration-weighted mean, observed maximum, zone seconds and
  coverage from full-resolution data; it uses the user's boundaries.

The LLM chooses the tools needed for the question. A typical analysis starts with
listing activities, then fetches details and stream statistics; an overview helps
inspect trends, while pagination is useful when every original reading is needed.
The former `get_recent_activities` name is now `list_recent_activities`.
