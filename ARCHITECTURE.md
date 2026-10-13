# Architecture

The bridge runs locally as an MCP server over stdio. An MCP host starts the process
and communicates using stdin/stdout. One process uses one configured Intervals.icu
athlete and personal API key.

```text
MCP host → stdio → MCP tool → IntervalsClient → APIClient → Intervals.icu
Activity CLI ──────────────────────┘
```

## Responsibilities

- `src/index.ts` loads validated configuration, starts the SDK's stdio service,
  and closes it on termination signals. Stdout is reserved for MCP messages;
  startup and transport diagnostics go to stderr. The SDK handles stdin closure.
- `src/mcp/server.ts` creates the server and client, then registers individual tools.
- `src/mcp/tools/` contains one file per tool, keeping its metadata, input/output
  schemas, and handler together. `list_recent_activities` accepts an
  optional day count (default 7, range 1–365), calls the activity client, and
  returns `{ activities }`. `get_activity_details` fetches one session's metrics and
  detected intervals by ID, returning `{ activity }`. `src/mcp/result.ts` provides
  shared result formatting and sanitized error handling with a JSON text fallback.
  `get_activity_stream_overview` selects measurements and a time window, and caps output
  using shared sample indices so timestamps and measurements remain aligned.
  `get_activity_stream_page` returns consecutive points with window-relative offsets
  and nullable nextOffset without sampling. Each call fetches current upstream data.
  `get_activity_stream_statistics` fetches full-resolution streams and delegates
  calculations to `src/intervals/activity-stream-statistics.ts`; it does not use sampled output.
- `src/intervals/config.ts` validates environment configuration with Zod.
  Entry-point commands load `.env`; reusable modules do not load files.
- `src/intervals/client.ts` owns endpoint paths, UTC date bounds, and activity
  response validation. `src/intervals/schemas.ts` defines validated activity
  summaries, session metrics, and intervals. MCP tool output schemas reuse these
  data schemas, keeping the Intervals layer independent of MCP contracts.
- `src/api/` handles HTTP requests, authentication headers, timeouts, and sanitized
  transport errors. Intervals uses Basic auth with the fixed username `API_KEY`.
- `src/cli.ts` provides human-readable activity output independently of MCP.

## Errors and boundaries

The MCP SDK validates tool arguments before calling the handler. HTTP errors are
returned as tool results with `isError: true`; malformed upstream responses get a
fixed message. Credentials, raw responses, and arbitrary exception details are
not included in tool errors. Empty activity lists are successful results.
Missing measurements are preserved as absent or null, rather than filled with
zero. Hidden activity stubs are rejected as unavailable session details.
Selected metrics and scalar streams are exposed; GPS coordinates are omitted.
Streams require ordered elapsed timestamps and matching measurement lengths.
The tool returns at most 500 points per stream, defaulting to 200. Longer windows
are sampled by index with endpoints preserved; the output reports source, window,
and returned counts plus a sampling flag. Sampling can miss short peaks and is
unsuitable for exact averages or time-in-zone calculations. Time windows allow
closer inspection without changing original elapsed timestamps. This bounds MCP
output, not the upstream download size.

## Stream statistics and missing measurements

Recordings contain discrete samples, sometimes at irregular intervals. A time
window can start or end between those samples. Summaries use the full-resolution
recording so output sampling does not affect calculated means or zone durations.
`src/intervals/activity-stream-statistics.ts` performs these calculations independently of
HTTP and MCP.

The calculation does not predict or reconstruct missing measurements. It assumes
each valid reading holds until the next timestamp for intervals within the gap
limit. Null readings and longer gaps remain unknown and are excluded from means
and zone durations. The final reading receives no duration beyond its timestamp.

For example, readings of 100 at second 0 and 160 at second 10, followed by a
recording endpoint at second 30, contribute `100 × 10 + 160 × 20`. The mean is
140 over 30 valid seconds. A window from seconds 5–25 clips those contributions
to 5 and 15 seconds, respectively. This is an explicit calculation assumption,
not a claim about unrecorded values.

Stream statistics hold each valid value until the next timestamp, clipping durations
to the requested window without extrapolating the final sample. Means are weighted
by valid duration, including measured zeros and stopped time. Intervals longer than
`maxGapSeconds` (default 30) are excluded even if they have a value. Each stream
reports valid, missing, and gap seconds plus coverage of the clipped window.
Extrema and valid sample counts describe observations within the window; a held
value originating before the window can contribute to its mean without being an
observed point inside it. Zero-duration windows have no mean or coverage percentage.
Optional zone boundaries use stream units and place exact boundary values in the
higher zone. Zones count valid duration only and require explicit boundaries;
athlete settings are not fetched or inferred. These recording-based statistics
may differ from Intervals' moving-time metrics.

Stdio has no network listener or separate user-authentication layer. The MCP host
controls access to the local process; the configured API key controls upstream
access. HTTP hosting and OAuth authorization are future work.

## Extending the server

Add an endpoint and response schema to the Intervals layer, then register a tool
in its own file under `src/mcp/tools/` with input/output schemas and annotations.
Register the tool in `src/mcp/server.ts` and reuse `src/mcp/result.ts` for responses.
Keep HTTP logic
in APIClient. Extract shared validation helpers when another endpoint introduces
actual repetition.

Tests mock HTTP transport and exercise tool discovery and calls through the SDK's
in-memory transport. No live API credentials are required. Update this document
when component responsibilities or transport decisions change.
