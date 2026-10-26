# Architecture

This document describes the bridge's own decisions: how upstream data becomes
usable tool results, how calculations are kept reliable, and how a reviewed
workout becomes a controlled calendar write. MCP wire semantics and Intervals
field definitions belong to their upstream documentation and the source contracts.
See [README.md](README.md) for setup, supported tools and CI/CD.

### ChatGPT through Docker and Secure MCP Tunnel

![ChatGPT through Docker and Secure MCP Tunnel](docs/diagrams/chatgpt-docker.svg)

ChatGPT sends MCP requests to OpenAI's Secure MCP Tunnel service. The local
`tunnel-client` initiates outbound HTTPS polling with its OpenAI runtime key,
retrieves requests and posts responses. The service does not open an inbound
connection to the computer, and the container publishes no ports.

Docker Compose runs the tunnel client and bridge in one container. The tunnel
client starts the compiled bridge as a separate Node.js child and exchanges MCP
JSON-RPC messages over stdio. Compose's init process forwards signals and reaps
exited children. The Docker boundary packages the processes together; the Node.js
boundary contains the MCP SDK, bridge application and its loaded libraries.

Compose reads the local `.env` for both components. OpenAI settings are mapped to
the tunnel client's environment variables, while the file is mounted for the
Node.js child to load its Intervals settings. The OpenAI runtime key authenticates
the tunnel; the Intervals key authenticates API calls. Both processes can access
the shared configuration, so this is not a credential isolation boundary.
Credentials are supplied at runtime and excluded from the image and repository.

### Local development through an MCP host

![Local development through a direct MCP host](docs/diagrams/local-development.svg)

A local MCP host, such as VS Code with Copilot, starts the compiled bridge directly
and exchanges MCP JSON-RPC messages over stdio. This path requires neither Docker
nor a tunnel. The host manages model communication and the conversation; the
bridge does not call a model API.

Both launch modes use the same server code with one configured athlete and
Intervals API key per process. Inside the bridge, the MCP SDK dispatches calls to
the application. The application uses Zod for schema validation, Axios for HTTPS
requests to Intervals.icu, and Garmin FIT SDK for workout encoding and verification.
Only the Axios connection reaches the external Intervals API.

Each launched bridge owns its own in-memory drafts and publication results.
The Docker and local development processes cannot share draft IDs. Restarting
either process loses its state.
See [reviewed workout state](#reviewed-workout-state) for publication guarantees and
[README](README.md#setup) for setup and startup instructions.

## Communication flow

This sequence documents the ChatGPT/Docker runtime. It focuses on the bridge's
input contracts, upstream data processing and reviewed workout state. The tunnel
and MCP SDK are shown only as the connection and dispatch path; their internal
protocol behaviour is left to upstream documentation. Library operations are
summarised inside the bridge rather than expanded into separate lifelines.

```mermaid
sequenceDiagram
    autonumber
    participant H as ChatGPT
    participant R as Secure MCP Tunnel service
    participant T as tunnel-client
    box Node.js process
        participant S as MCP SDK
        participant B as Bridge application
    end
    participant I as Intervals.icu API

    T->>B: Start compiled Node.js server with environment
    B->>B: Validate configuration and construct client and session state
    B->>S: Register tools and serve over stdio
    Note over H,S: Tool discovery uses this same connection path
    Note over R,T: The running client polls over outbound HTTPS and posts responses

    loop Each selected tool call
        H->>R: MCP tool request
        R-->>T: Deliver request through client polling
        T->>S: JSON-RPC over stdio
        S->>B: Dispatch call after SDK input validation

        alt Read athlete data or analyse activity streams
            B->>I: HTTPS GET through Intervals adapter and Axios
            I-->>B: HTTP response or request failure
            alt Successful HTTP response
                B->>B: Validate response schema and domain consistency
                B->>B: Curate data or compute requested stream analysis
            else Request failure
                B->>B: Map HTTP failure to a sanitized error
            end
        else Preview planned workout
            B->>B: Validate workout and reuse identical draft if present
            opt New draft within session capacity
                B->>B: Encode and verify FIT with Garmin SDK
                B->>B: Store exact workout and FIT bytes under draft ID
            end
            Note over H,B: Return preview for review. Publication requires a separate call after explicit user approval.
        else Publish planned workout with approved=true
            B->>B: Look up draft in this server session
            alt Draft already published
                B->>B: Return stored event without another API request
            else Draft ready for publication
                B->>B: Set state to publishing
                B->>I: HTTPS POST stored FIT bytes through adapter and Axios
                I-->>B: HTTP response or request failure
                alt Successful response with valid event schema
                    B->>B: Store event and set state to published
                else Request failure or invalid event response
                    B->>B: Set state to unknown and block blind retries
                end
            else Draft missing, publishing or outcome unknown
                B->>B: Reject publication without an API request
            end
        end

        B->>B: Format success or map failure to a controlled tool error
        B-->>S: Structured content and JSON text, or isError result
        S-->>T: JSON-RPC tool response over stdio
        T->>R: Post response over outbound HTTPS
        R-->>H: MCP tool response
    end
```

The arrows to Intervals summarise calls through our HTTP adapter and Axios, not
a direct network implementation in the tool handlers. Successful HTTP responses
are schema-validated with Zod before domain checks and analysis. Validation or
processing failures return controlled errors; they do not continue as successful
data. A tool may require several upstream reads; the diagram groups that work
into one interaction. SDK-rejected inputs never reach the handler.

Preview and publication are separate calls. ChatGPT presents the preview and
obtains approval for that exact draft before requesting publication. The server
checks the approval argument and draft state; it cannot inspect conversation
consent. A failed publication attempt has an uncertain outcome because the event
may already exist upstream, so the server blocks automatic retries.

For local development, the MCP host starts the same bridge directly and exchanges
stdio messages with the SDK. The tunnel participants are absent; application
processing and session-state rules remain the same.

## Composition and ownership

The repository separates runtime code, deployment configuration, verification
and documentation:

| Folder    | Responsibility and reason for separation                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`    | Runtime application code, divided into the responsibilities below.                                                                                                                                                                                |
| `docker/` | Container support configuration, including the Secure MCP Tunnel configuration. The root `Dockerfile` defines image construction and `compose.yaml` runs the published image. Development uses the compiled application through a local MCP host. |
| `tests/`  | Automated checks, fixtures and HTTP mocks. Verifies application behavior and integration contracts without live credentials.                                                                                                                      |
| `docs/`   | Supporting documentation assets, including architecture diagram sources and exported diagrams.                                                                                                                                                    |

Within `src/`, folders separate application behavior, external integration,
protocol handling and data contracts:

| Folder           | Responsibility and reason for separation                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/`       | Bridge-specific behavior, grouped by feature: stream processing and workout workflows. Keeps these operations independent of MCP registration; feature-specific helpers such as FIT encoding stay beside their workflow. |
| `src/http/`      | Shared HTTP transport: `HTTPClient`, authentication types and sanitized request/response errors. Contains no Intervals endpoint or training logic.                                                                       |
| `src/intervals/` | Intervals integration: configuration and the `IntervalsApi` adapter for endpoints, request mapping and response consistency checks, and zone warnings. Hides upstream API details from tool handlers.                    |
| `src/mcp/`       | MCP server composition, tool registration and result formatting. Tool-specific schemas live in the tool module or an adjacent `.schemas.ts` file when larger.                                                            |
| `src/schemas/`   | Shared data contracts and their derived TypeScript types in a flat directory; configuration validation stays with its loader.                                                                                            |

`src/errors.ts` defines the shared exception hierarchy. Expected failures inherit
from `AppError` and carry controlled messages supplied at the throw site.

`src/index.ts` loads configuration and calls `startServer(config)` inside the
entry-point `try/catch`, which handles synchronous startup failures.
`src/mcp/server.ts` assembles the server and starts the SDK's `serveStdio`
transport. The server factory constructs the client, registers tools and owns
session-scoped state. The SDK owns protocol negotiation, transport startup and EOF teardown;
SIGINT and SIGTERM request shutdown through its returned handle. SDK-reported
failures are written to stderr. Transport lifecycle errors follow SDK
semantics rather than a separate application transport wrapper.

The MCP SDK supplies transport and dispatch. Supporting libraries supply schema
validation (Zod), HTTP execution (Axios) and FIT encoding/decoding (Garmin SDK).
They run inside the process; Intervals.icu is the external service reached over
HTTPS. The host owns model communication, while the bridge owns Intervals access.

### Data contracts and processing

Each tool registers its operation through `toolHandler` in
`src/mcp/tool-handler.ts`. This shared wrapper returns the same successful object
as structured content and JSON text for host compatibility. It encloses the application operation,
including HTTP and tool-side processing. Expected failures use responsibility-specific
`AppError` subclasses with controlled messages supplied where they are thrown; unknown exceptions become a
generic internal error. The shared tool boundary rethrows expected exceptions
unchanged and replaces unexpected ones with a safe error. Wrapped execution failures retain
their original exceptions and stacks through `Error.cause`. Expected schema
validation failures use controlled messages without retaining Zod internals; the SDK exposes only
the outer message. The MCP SDK converts
handler exceptions into `isError` results; input validation and protocol errors
also remain its responsibility. Output-schema validation happens after the
application wrapper, so its diagnostics are SDK-generated; schema descriptions
and custom validation messages must not contain secrets.
HTTP error translation and publication state changes stay at their respective
boundaries. Credentials, raw responses and arbitrary exception details do not
reach the model.

Network-backed tools pass the SDK's `ctx.mcpReq.signal` through `IntervalsApi`
to `HTTPClient`. HTTP requests combine caller cancellation with a 15-second
deadline; the Axios timeout remains a separate transport safeguard. SDK connection
teardown also aborts in-flight requests. Cancelling publication before the write
starts leaves the draft ready. Once publication has started, a cancellation failure
marks its outcome unknown and blocks another write, since aborting the local request
does not prove that Intervals has not created the event.

The MCP SDK validates tool inputs, and the HTTP adapter validates upstream
responses before application processing. Internal client methods consume validated
arguments without parsing them again. Workout preview accepts a branded, normalized
`PlannedWorkout` and takes its own snapshot; direct callers must parse raw input
before calling it. Configuration loading and stricter upstream time-stream checks
remain separate validation boundaries. Response schemas select exposed fields.
The Intervals client then enforces domain
consistency, such as athlete identity, wellness date integrity and stream alignment.
Missing observations remain absent or null. Wellness fitness/fatigue values come
from Intervals rather than a fitness or medical-readiness model calculated here.

Recent activities, workload and wellness accept explicit inclusive athlete-local
dates (`oldest`/`newest`, `YYYY-MM-DD`). The host resolves relative dates using
athlete settings; the bridge forwards the supplied dates without timezone lookup
or conversion. Recent activities retains its 365-day limit; workload and wellness
retain their 90-day limit.

Zone settings are numeric arrays returned as recorded. Non-increasing boundaries
produce advisory `zoneWarnings` without replacing or rejecting the values. The
bridge does not repair upstream configuration; statistics retain their own explicit
input requirements.

Stream presentation and numerical analysis are separate operations. Sampling keeps
overviews manageable, paging preserves original readings, and statistics use
full-resolution data with coverage information. This prevents presentation sampling
from changing numerical analysis. Output limits do not bound the upstream download.
Detailed units, gap rules and zone semantics stay in source contracts and tests.

### Reviewed workout state

The preview/publish split binds approval to a concrete artifact. Preview validates
a workout, encodes and verifies its FIT representation, and stores the workout and
bytes in a bounded, session-scoped registry. Content hashing reuses identical
previews. Publication uses the stored bytes rather than regenerating the workout.

Drafts transition through ready, publishing, published or unknown states. The
publication guard prevents overlapping writes and returns the stored event after
a successful publication. An uncertain outcome blocks retries because a timeout
or invalid response can occur after Intervals has already created the event.

Restarting the process loses drafts and stored event results. The draft external
ID is not a durable idempotency guarantee. Explicit user approval is enforced by
the host workflow, while the server checks the approval argument and draft state.
It cannot independently inspect conversation consent.

## Maintaining these boundaries

Add endpoint integration and response contracts in the Intervals layer, then
register a tool using the shared `toolHandler` wrapper. Keep calculations independent of
transport and keep write state explicit. Tests mock upstream HTTP and exercise
SDK discovery/calls through in-memory transport; they verify our contracts without
requiring live credentials.

`pnpm typecheck` uses `tsconfig.json` to check application sources, tests and the
Vitest configuration without emitting files. Local and Docker builds use
`pnpm build` with `tsconfig.build.json`, which extends `tsconfig.json` and compiles
only `src` to `dist/src`, deliberately excluding tests.

PR and main CI also build the Docker runtime image and run the existing stdio
suite against its compiled JavaScript entry point using `pnpm test:container`.
Test containers use dummy credentials, have networking disabled and override the
tunnel entry point with Node. The checks cover initialization, tool discovery,
FIT preview, EOF/signal shutdown and invalid configuration. Upstream HTTP behavior
is covered by the separate mocked integration tests. The container smoke suite
does not exercise the tunnel control plane or a live ChatGPT connection; those
remain separate acceptance checks.

Update the diagrams when responsibilities, dependencies, transport or state
ownership change. Leave detailed field rules in schemas/tool descriptions and CI
steps in the workflow files.

Upstream references: [MCP SDK](https://ts.sdk.modelcontextprotocol.io/v2/),
[Intervals API](https://intervals.icu/api-docs.html),
[Garmin FIT workouts](https://developer.garmin.com/fit/articles/file-types/workout.html).
