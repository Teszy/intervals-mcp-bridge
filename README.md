# intervals-mcp-bridge

A lightweight MCP server exposing endurance training data to AI assistants.

## Development

Start the development server with automatic reload:

```bash
    pnpm dev
```

Run all quality checks before committing:

```bash
    pnpm check
```

## Versioning

The project follows Conventional Commits and Semantic Versioning.

- `fix:` → patch release
- `feat:` → minor release
- `BREAKING CHANGE` / `!` → major release

Releases are created automatically from commits on `main`.

## Intervals.icu client

This first slice provides configuration and an activity client; it does not start an MCP server yet.
Use Node.js 24 and the pnpm version pinned in `package.json`.

Copy `.env.example` to `.env` and set `INTERVALS_API_KEY` to your personal API key
from Intervals.icu Settings > Developer Settings. `INTERVALS_ATHLETE_ID=0` selects
the key's owner; a numeric athlete ID or an ID prefixed with `i` is also accepted.
The key is required. A missing athlete variable defaults to `0`; an explicitly
empty or malformed value is rejected. Keep `.env` out of Git.

```ts
import { IntervalsClient } from './src/intervals/client.js';
import { loadIntervalsConfig } from './src/intervals/config.js';

const client = new IntervalsClient(loadIntervalsConfig());
const activities = await client.getRecentActivities(); // defaults to 7 days
```

Configuration reads environment variables when called, without loading `.env`
automatically. To try a real request from the repository root:

```bash
node --env-file=.env --import tsx --input-type=module -e '
import { IntervalsClient } from "./src/intervals/client.ts";
import { loadIntervalsConfig } from "./src/intervals/config.ts";
console.log(await new IntervalsClient(loadIntervalsConfig()).getRecentActivities());
'
```

`getRecentActivities(days)` accepts 1–365 calendar days, including today. UTC selects
both date bounds: on January 3, seven days means December 28 through January 3.
The API filters using activity local dates; returned `start_date_local` values are
kept unchanged. The client preserves API ordering and returns a validated subset:
`id`, `name`, `type`, `start_date_local`, `distance` (meters), and `moving_time`
(seconds). Fields other than `id` may be absent or null, including in partial summaries.

Requests use Basic authentication with username `API_KEY`, have a 15-second timeout,
and reject redirects. HTTP failures throw `IntervalsApiError` with a numeric `status`;
network failures and malformed responses throw descriptive errors. Error messages
omit the API key and response body. No retries are performed.

Tests inject `fetch` and a clock, so `pnpm check` needs no API credentials or live
Intervals.icu requests. Coverage thresholds remain at 80%.

API reference: [Intervals.icu integration cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090).
