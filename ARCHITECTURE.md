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
  schemas, and handler together. `get_recent_activities` accepts an
  optional day count (default 7, range 1–365), calls the activity client, and
  returns `{ activities }`. `get_activity` fetches one session's metrics and
  detected intervals by ID, returning `{ activity }`. `src/mcp/result.ts` provides
  shared result formatting and sanitized error handling with a JSON text fallback.
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
zero. Hidden activity stubs are rejected as unavailable session details. Only
selected metrics are exposed; GPS coordinates and raw time-series data are omitted.

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
