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

## Athlete settings and training zones

Use `{"name":"get_athlete_settings","arguments":{}}` to retrieve current training
settings for the configured athlete, including sport profiles, outdoor/indoor FTP,
threshold/max heart rate, threshold speed and original zone limits and names.
For “What are my running zones?”, the LLM selects the profile whose `types` includes
`Run`; profiles can cover several activity types. Missing or null values remain
unavailable. The response includes only selected training fields, excluding account
credentials and unrelated profile data.

`hr_zones` contains upper limits in bpm. `power_zones` contains percentages of FTP;
`pace_zones` contains percentages of threshold speed. Each includes the final zone.
`threshold_pace` is in meters/second, regardless of the `pace_units` display setting.
For example, 3.3333 m/s is approximately 5:00 min/km. These original upper limits
must not be passed directly as the lower-inclusive absolute boundaries accepted by
`get_activity_stream_statistics`. Statistics still require explicit boundaries.
Settings are current; they do not describe historical zones for an older activity.
Custom zone definitions are not included in this first implementation.

Contracts are based on the [official OpenAPI schema](https://intervals.icu/api/v1/docs)
and the [Intervals data model](https://forum.intervals.icu/t/server-side-data-model-for-scripts/25781).

## Activity workload and daily wellness

Two read-only tools expose training and recovery context over the same explicit
athlete-local date range. `oldest` and `newest` are inclusive `YYYY-MM-DD` dates;
a request may span at most 90 calendar days. For longer periods, use adjacent
non-overlapping ranges. Use the timezone returned by `get_athlete_settings` to
resolve “today” or “last week”; these tools do not infer dates from the server clock.

- “Compare the load of my recent sessions.”
  `{"name":"list_activity_workload","arguments":{"oldest":"2026-10-01","newest":"2026-10-13"}}`.
  Returns each activity's recorded load, intensity, duration, distance and optional
  perceived exertion. `icu_training_load` is the selected Intervals load; power,
  heart-rate and pace loads are alternative estimates and must not be added together.
- “How has my recovery changed over the same period?”
  `{"name":"list_wellness","arguments":{"oldest":"2026-10-01","newest":"2026-10-13"}}`.
  Returns daily records oldest first, with upstream CTL/ATL, ramp rate, sleep,
  resting heart rate, HRV, weight and subjective recovery ratings where available.

Wellness means recorded daily state; it does not require users to enter data.
Absent days and missing/null values stay unknown, rather than becoming zeros or
rest days. Restricted activities may expose only an ID, so missing session loads
prevent a complete period total. CTL (fitness) and ATL (modeled fatigue) are returned
from Intervals, not recalculated; ATL is distinct from the subjective `fatigue` rating.
The bridge does not derive form or prescribe a workout from these values.

Sleep duration is in seconds, resting heart rate in bpm, HRV in milliseconds and
weight in kilograms. HRV rMSSD (`hrv`) and SDNN (`hrvSDNN`) are separate metrics.
Subjective rating scales are described in the output schema; a higher value can
mean a worse state, and source-provided `sleepScore` scales can vary.
`tempWeight` and `tempRestingHR` flag settings-derived values rather than authoritative
daily observations. Today may contain incomplete data. Comments, custom fields and
unselected personal fields are excluded from tool responses.

## Planned workouts and FIT publication

`preview_planned_workout` builds a structured workout, validates it, generates a
FIT file using the official Garmin SDK, and checks its integrity by decoding it.
It does not write to Intervals. The first version supports `Run` and `Ride`, with
1–50 sequential steps. Each step has a time duration in whole seconds or a distance
in whole meters, plus an open target or absolute heart-rate (bpm), power (watts),
or speed (m/s) range. Expand repeated interval blocks into sequential steps.
Relative targets, named zones, ramps, swim steps and open-ended durations are not
accepted; resolve agreed targets to absolute values before previewing.

Example: “Preview a 30-minute easy run tomorrow at 9, with my agreed 120–140 bpm target.”
Resolve tomorrow using the athlete timezone from `get_athlete_settings`, then call:

```json
{
  "name": "preview_planned_workout",
  "arguments": {
    "workout": {
      "name": "Easy run",
      "sport": "Run",
      "startDateLocal": "2026-10-14T09:00:00",
      "steps": [
        {
          "name": "Easy running",
          "intensity": "active",
          "duration": { "type": "time", "seconds": 1800 },
          "target": { "type": "heartRate", "low": 120, "high": 140 }
        }
      ]
    }
  }
}
```

Show the returned local date, sport, all steps and target ranges to the user.
For mixed time/distance workouts, `timedSeconds` and `distanceMeters` describe only
those respective steps; `totalDurationKnown` is false. Speed targets use 0.001 m/s
precision. Pace in seconds/km converts to `1000 / pace` m/s; faster pace gives the
higher speed bound. Names must fit in 100 UTF-8 bytes and cannot contain NUL.

After the user explicitly approves that exact preview, call:

```json
{
  "name": "publish_planned_workout",
  "arguments": { "draftId": "<UUID returned by preview>", "approved": true }
}
```

The server sends the stored FIT bytes to the configured athlete's calendar as a
`WORKOUT`. It returns the created event ID. Any change needs a new preview and
approval. The approval flag is a host/LLM contract; the server cannot independently
verify the conversation's user consent. Device sync depends on Intervals settings.

Drafts exist in memory for one server session, with at most 100 distinct previews.
Identical input reuses the same draft. Successful repeat publication returns the
stored event without another write; concurrent and uncertain attempts are blocked.
After a failed write, inspect the calendar before creating another draft or restarting,
because the event may already exist. This session protection does not provide
idempotency across server restarts. No existing events are updated or deleted.
Calendar publication needs upstream calendar write access (`CALENDAR:WRITE` for OAuth).

Contracts follow the [Intervals planned-workout upload guide](https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624)
and [Garmin FIT workout format](https://developer.garmin.com/fit/articles/file-types/workout.html).
