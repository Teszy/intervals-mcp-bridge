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
`get_recent_activities` with optional `days` (1–365; default 7). It waits for MCP
messages; use `pnpm activities` for a terminal table.
Use `get_activity` with an ID from that list to retrieve session metrics and
detected work/recovery intervals. Missing measurements remain unavailable;
full time-series streams are not included yet.

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
