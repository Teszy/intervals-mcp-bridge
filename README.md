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

## Links

- [Architecture and extension guide](ARCHITECTURE.md)

- [Intervals.icu API reference](https://intervals.icu/api-docs.html)
- [API access and personal API keys](https://forum.intervals.icu/t/api-access-to-intervals-icu/609)
- [API integration cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090)
- [OAuth setup](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Contributing

Pre-commit hooks format and lint staged files, then run type checks and tests
(`pnpm check:commit`). CI runs the full `pnpm check`, including coverage and build.
Use [Conventional Commits](https://www.conventionalcommits.org/). Release Please opens
a PR updating `package.json` and `CHANGELOG.md`; merging it publishes the Git tag
and GitHub Release. The MCP server reads its version from `package.json`.

Release automation requires the repository Actions secret `RELEASE_PLEASE_TOKEN`:
a fine-grained GitHub token restricted to this repository with Contents, Pull
requests, and Issues read/write permissions. This lets release PRs trigger CI
without bypassing branch protection. See the
[Release Please setup](https://github.com/googleapis/release-please-action#github-credentials).
