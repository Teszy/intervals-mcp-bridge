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
- `src/mcp/server.ts` builds the tool registry. `get_recent_activities` accepts an
  optional day count (default 7, range 1–365), calls the activity client, and
  returns `{ activities }` as structured content and a JSON text fallback.
- `src/intervals/config.ts` validates environment configuration with Zod.
  Entry-point commands load `.env`; reusable modules do not load files.
- `src/intervals/client.ts` owns endpoint paths, UTC date bounds, and activity
  response validation. Its exported activity schema also defines MCP output.
- `src/api/` handles HTTP requests, authentication headers, timeouts, and sanitized
  transport errors. Intervals uses Basic auth with the fixed username `API_KEY`.
- `src/cli.ts` provides human-readable activity output independently of MCP.

## Errors and boundaries

The MCP SDK validates tool arguments before calling the handler. HTTP errors are
returned as tool results with `isError: true`; malformed upstream responses get a
fixed message. Credentials, raw responses, and arbitrary exception details are
not included in tool errors. Empty activity lists are successful results.

Stdio has no network listener or separate user-authentication layer. The MCP host
controls access to the local process; the configured API key controls upstream
access. HTTP hosting and OAuth authorization are future work.

## Extending the server

Add an endpoint and response schema to the Intervals layer, then register a tool
with explicit input/output schemas and appropriate annotations. Keep HTTP logic
in APIClient. Extract shared validation helpers when another endpoint introduces
actual repetition.

Tests mock HTTP transport and exercise tool discovery and calls through the SDK's
in-memory transport. No live API credentials are required. Update this document
when component responsibilities or transport decisions change.
