# intervals-mcp-bridge

A lightweight MCP bridge for Intervals.icu training data. Currently includes an
activity CLI; the MCP server is still in development.

## Setup

Use Node.js 24 and the pnpm version pinned in `package.json`.

```bash
pnpm install
cp .env.example .env
```

Set your personal API key and athlete ID in `.env`, following the comments in
[.env.example](.env.example). The activity command loads this file automatically.

## Commands

| Command                  | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `pnpm activities`        | Fetch activities from the last 7 days                             |
| `pnpm activities 30`     | Fetch activities from the last 30 days                            |
| `pnpm activities --help` | Show CLI usage                                                    |
| `pnpm test`              | Run tests in watch mode                                           |
| `pnpm test:run`          | Run tests once                                                    |
| `pnpm check`             | Run formatting, lint, type checks, tests with coverage, and build |
| `pnpm format`            | Format the project                                                |
| `pnpm build`             | Compile TypeScript to `dist/`                                     |

Tests use mocked HTTP responses and require no API credentials.

## Links

- [Intervals.icu API reference](https://intervals.icu/api-docs.html)
- [API access and personal API keys](https://forum.intervals.icu/t/api-access-to-intervals-icu/609)
- [API integration cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090)
- [OAuth setup](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Contributing

Pre-commit hooks format and lint staged files, then run type checks and tests
(`pnpm check:commit`). CI runs the full `pnpm check`, including coverage and build.
Use [Conventional Commits](https://www.conventionalcommits.org/); releases are
generated automatically from `main` as Git tags and GitHub Releases; release versions
are not committed back to `package.json`.
